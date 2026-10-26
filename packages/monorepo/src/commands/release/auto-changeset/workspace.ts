import type { AutoChangesetGitHub } from './github/client'
import type { GitTree } from './github/tree'
import type { AutoChangesetDependencyField } from './types'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import semver from 'semver'
import validatePackageName from 'validate-npm-package-name'
import YAML from 'yaml'
import { findWorkspacePackages } from '../../../core/workspace/discovery'
import { dependencyReferences } from '../../package-check/dependencies'
import { record } from './github/client'
import { readBlob } from './github/tree'

export interface MetadataPackage {
  name: string
  directory: string
  private: boolean
  dependencies: Array<{ name: string, field: AutoChangesetDependencyField }>
}

const fields: AutoChangesetDependencyField[] = ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies']

function resolveCatalogs(manifest: Record<string, unknown>, workspace: Record<string, unknown>) {
  const result = { ...manifest } as Record<string, Record<string, string>>
  for (const field of fields) {
    if (manifest[field] === undefined) {
      continue
    }
    const values = record(manifest[field], `manifest ${field}`)
    result[field] = Object.fromEntries(Object.entries(values).map(([alias, value]) => {
      if (typeof value !== 'string') {
        throw new TypeError(`Invalid dependency range: ${alias}.`)
      }
      if (!value.startsWith('catalog:')) {
        return [alias, value]
      }
      const name = value.slice(8)
      const catalog = name && name !== 'default' ? record(record(workspace['catalogs'], 'workspace catalogs')[name], 'named catalog') : record(workspace['catalog'], 'default catalog')
      const resolved = Object.hasOwn(catalog, alias) ? catalog[alias] : undefined
      if (typeof resolved !== 'string' || resolved.startsWith('catalog:')) {
        throw new Error(`Missing catalog dependency: ${alias}.`)
      }
      return [alias, resolved]
    }))
  }
  return result
}

/** Only inert manifests enter the temporary workspace: no checkout, install, or code loading. */
export async function discoverPackages(client: AutoChangesetGitHub, tree: GitTree): Promise<MetadataPackage[]> {
  const workspaceEntry = tree.entries.get('pnpm-workspace.yaml')
  if (!workspaceEntry || !tree.entries.has('package.json')) {
    throw new Error('Automatic changesets require pnpm-workspace.yaml and the root package.json.')
  }
  const workspaceText = await readBlob(client, workspaceEntry)
  const workspace = record(YAML.parse(workspaceText), 'workspace manifest')
  if (!Array.isArray(workspace['packages']) || workspace['packages'].some(pattern => typeof pattern !== 'string')) {
    throw new Error('Workspace packages must be a complete list of pnpm patterns.')
  }
  if ((workspace['packages'] as string[]).some((pattern) => {
    const value = pattern.replace(/^!+/u, '')
    return !value || value.startsWith('/') || value.includes('..') || value.includes('\\') || value.includes(':') || value.includes('\0') || /[\r\n]/u.test(value)
  })) {
    throw new Error('Workspace package patterns must remain inside the isolated metadata directory.')
  }
  const directory = await mkdtemp(path.join(os.tmpdir(), 'repoctl-auto-changeset-'))
  try {
    await writeFile(path.join(directory, 'pnpm-workspace.yaml'), workspaceText)
    const portablePaths = new Set<string>()
    for (const filename of tree.entries.keys()) {
      if (path.posix.basename(filename) !== 'package.json' || filename.split('/').includes('node_modules')) {
        continue
      }
      const portable = filename.toLowerCase()
      if (portablePaths.has(portable)) {
        throw new Error('Workspace metadata contains paths that collide on case-insensitive filesystems.')
      }
      portablePaths.add(portable)
      const destination = path.join(directory, ...filename.split('/'))
      await mkdir(path.dirname(destination), { recursive: true })
      // Discovery needs paths only. Excluded fixtures may intentionally contain invalid JSON or symlinks.
      await writeFile(destination, '{}')
    }
    const discovered = await findWorkspacePackages(directory, { patterns: workspace['packages'] as string[] })
    const selected = await Promise.all(discovered.map(async (pkg) => {
      const relativeDir = path.relative(directory, pkg.rootDir).split(path.sep).join('/')
      const filename = relativeDir ? `${relativeDir}/package.json` : 'package.json'
      const entry = tree.entries.get(filename)
      if (!entry) {
        throw new Error(`Discovered workspace metadata is missing from the Git tree: ${filename}.`)
      }
      const manifest = record(JSON.parse(await readBlob(client, entry)), `manifest ${filename}`)
      return { ...pkg, manifest: manifest as typeof pkg.manifest }
    }))
    const names = new Set<string>()
    const packages = selected.filter(pkg => pkg.manifest.name || pkg.manifest.private !== true).map((pkg) => {
      const name = pkg.manifest.name
      const relativeDir = path.relative(directory, pkg.rootDir).split(path.sep).join('/') || '.'
      if (!name || !validatePackageName(name).validForNewPackages || names.has(name)
        || (pkg.manifest.private !== true && !semver.valid(pkg.manifest.version))) {
        throw new Error(`Workspace package metadata is invalid or duplicated: ${relativeDir}.`)
      }
      names.add(name)
      return { pkg, name, directory: relativeDir }
    })
    return packages.map(({ pkg, name, directory: relativeDir }) => {
      const manifest = resolveCatalogs(pkg.manifest as Record<string, unknown>, workspace)
      const dependencies = dependencyReferences(manifest, pkg.rootDir, true).flatMap((dependency) => {
        const target = dependency.directory ? packages.find(item => path.resolve(item.pkg.rootDir) === path.resolve(dependency.directory!)) : undefined
        if (dependency.directory && !target) {
          return []
        }
        return [{ name: target?.name ?? dependency.name, field: dependency.field as AutoChangesetDependencyField }]
      })
      return { name, directory: relativeDir, private: pkg.manifest.private === true, dependencies }
    })
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
}
