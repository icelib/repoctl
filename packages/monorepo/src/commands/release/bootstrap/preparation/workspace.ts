import type { WorkspacePackageWithJsonPath } from '../../../../types'
import type { PackedManifest } from '../../../package-check/types'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parse } from 'yaml'
import { clearWorkspaceCache, getWorkspaceData } from '../../../../core/workspace'
import { dependencyReferences } from '../../../package-check/dependencies'

function inside(root: string, target: string) {
  const relative = path.relative(root, path.resolve(target))
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

interface WorkspaceConfiguration {
  packages?: string[]
  catalog?: Record<string, string>
  catalogs?: Record<string, Record<string, string>>
}

export async function bootstrapWorkspace(root: string, packageName: string) {
  const config = parse(await readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8')) as WorkspaceConfiguration
  if (!config || !Array.isArray(config.packages) || config.packages.some(pattern => typeof pattern !== 'string' || path.isAbsolute(pattern.replace(/^!/u, '')) || pattern.split(/[\\/]/u).includes('..'))) {
    throw new Error('Bootstrap workspace patterns must stay inside the source repository.')
  }
  clearWorkspaceCache()
  const workspace = await getWorkspaceData(root, { ignorePrivatePackage: false, ignoreRootPackage: false })
  if (path.resolve(workspace.workspaceDir) !== root || workspace.packages.some(pkg => !inside(root, pkg.rootDir))) {
    throw new Error('Bootstrap workspace packages must stay inside the source repository.')
  }
  const byName = new Map<string, WorkspacePackageWithJsonPath>()
  const byDirectory = new Map(workspace.packages.map(pkg => [path.resolve(pkg.rootDir), pkg]))
  for (const pkg of workspace.packages) {
    if (pkg.manifest.name) {
      if (byName.has(pkg.manifest.name)) {
        throw new Error(`Duplicate bootstrap workspace package: ${pkg.manifest.name}`)
      }
      byName.set(pkg.manifest.name, pkg)
    }
  }
  const target = byName.get(packageName)
  if (!target || target.manifest.private === true || path.resolve(target.rootDir) === root) {
    throw new Error('Bootstrap requires one exact public workspace subpackage name.')
  }
  const targetManifest = target.manifest as unknown as Record<string, unknown>
  const value = targetManifest['publishConfig']
  if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value))) {
    throw new Error('Bootstrap publishConfig must be a JSON object.')
  }
  const publishConfig = value as Record<string, unknown> | undefined
  if (publishConfig?.['directory'] !== undefined) {
    throw new Error('Bootstrap does not support publishConfig.directory: the frozen package root must own its manifest, checks and native pnpm pack output.')
  }
  if (publishConfig?.['access'] !== undefined && publishConfig['access'] !== 'public') {
    throw new Error('Bootstrap requires a public workspace target and cannot override explicit nonpublic publishConfig.access.')
  }
  const registry = publishConfig?.['registry']
  if (registry !== undefined && (typeof registry !== 'string' || !['https://registry.npmjs.org', 'https://registry.npmjs.org/'].includes(registry))) {
    throw new Error('Bootstrap cannot move a workspace target from its explicit registry to the official public npm registry.')
  }
  const closure = new Map<string, WorkspacePackageWithJsonPath>()
  function visit(pkg: WorkspacePackageWithJsonPath) {
    if (closure.has(pkg.rootDir)) {
      return
    }
    closure.set(pkg.rootDir, pkg)
    for (const reference of dependencyReferences(pkg.manifest as PackedManifest, pkg.rootDir, true)) {
      const catalog = reference.range.startsWith('catalog:') ? reference.range.slice(8) || 'default' : undefined
      const catalogValue = catalog === 'default' ? (config.catalog ?? config.catalogs?.['default'])?.[reference.alias] : catalog ? config.catalogs?.[catalog]?.[reference.alias] : undefined
      if (catalog && typeof catalogValue !== 'string') {
        throw new Error(`Bootstrap cannot resolve catalog dependency ${pkg.manifest.name}: ${reference.alias}.`)
      }
      const resolved = typeof catalogValue === 'string'
        ? dependencyReferences({ [reference.field]: { [reference.alias]: catalogValue } }, pkg.rootDir, true)[0]!
        : reference
      if (resolved.directory && !inside(root, resolved.directory)) {
        throw new Error('Bootstrap local dependencies must stay inside the source repository.')
      }
      const dependency = resolved.directory ? byDirectory.get(path.resolve(resolved.directory)) : byName.get(resolved.name)
      if (!dependency && resolved.protocol !== 'registry') {
        throw new Error(`Bootstrap cannot resolve local dependency ${pkg.manifest.name}: ${reference.alias}.`)
      }
      if (dependency) {
        visit(dependency)
      }
    }
  }
  visit(target)
  return { target, workspace, buildDirectories: [...closure.keys()].map(directory => path.relative(root, directory).split(path.sep).join('/') || '.').sort() }
}
