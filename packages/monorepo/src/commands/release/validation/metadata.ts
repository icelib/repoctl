import type { GitOptions, GitTree } from './git'
import { Buffer } from 'node:buffer'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import path from 'pathe'
import YAML from 'yaml'
import { findWorkspacePackages } from '../../../core/workspace/discovery'
import { readBlob } from './git'

const manifestFields = ['name', 'version', 'private', 'packageManager', 'dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'peerDependenciesMeta']
const workspaceFields = ['packages', 'catalog', 'catalogs', 'versioning']
const versioningFields = ['fixed', 'ignore', 'maxBump', 'lanes', 'epics', 'changelog']
type Data = Record<string, unknown>

function record(value: unknown): Data {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid release metadata: expected an object.')
  }
  return value as Data
}

function pick(value: Data, fields: string[]) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => fields.includes(key)))
}

function sanitizeManifest(content: Buffer) {
  const original = record(JSON.parse(content.toString()))
  const manifest = pick(original, manifestFields)
  // Native registry probes use the published identity, which can differ from the workspace name.
  if (original['publishConfig'] !== undefined) {
    manifest['publishConfig'] = pick(record(original['publishConfig']), ['name', 'registry'])
  }
  return Buffer.from(JSON.stringify(manifest, null, 2))
}

function sanitizeWorkspace(content: Buffer) {
  const workspace = pick(record(YAML.parse(content.toString())), workspaceFields)
  const patterns = workspace['packages']
  if (patterns !== undefined && (!Array.isArray(patterns) || patterns.some((pattern) => {
    if (typeof pattern !== 'string') {
      return true
    }
    const value = pattern.replace(/^!+/, '')
    return !value || value.startsWith('/') || value.split('/').includes('..') || /[\\:\0\r\n]/.test(value)
  }))) {
    throw new Error('Workspace patterns must remain inside the isolated metadata tree.')
  }
  if (workspace['versioning'] !== undefined) {
    const versioning = record(workspace['versioning'])
    if (Object.keys(versioning).some(key => !versioningFields.includes(key))) {
      throw new Error('Unsupported native versioning configuration; executable extensions cannot be replayed.')
    }
    if (versioning['changelog'] !== undefined) {
      const changelog = record(versioning['changelog'])
      if (Object.keys(changelog).some(key => key !== 'storage') || !['repository', 'registry'].includes(String(changelog['storage']))) {
        throw new Error('Only native repository/registry changelog storage can be replayed.')
      }
    }
  }
  return Buffer.from(YAML.stringify(workspace))
}

function metadataFile(filename: string) {
  return filename === 'pnpm-workspace.yaml' || /(?:^|\/)package\.json$/.test(filename)
    || /(?:^|\/)CHANGELOG\.md$/.test(filename) || /^\.changeset\/[^/]+\.(?:md|yaml)$/.test(filename)
}

export interface Metadata {
  original: Map<string, Buffer>
  isolated: Map<string, Buffer>
}

async function selectManifests(cwd: string, tree: GitTree, workspace: Buffer) {
  const manifests = [...tree.keys()].filter(filename => path.basename(filename) === 'package.json'
    && !filename.split('/').some(part => ['node_modules', 'bower_components'].includes(part)))
  for (const filename of manifests) {
    await mkdir(path.dirname(path.join(cwd, filename)), { recursive: true })
    await writeFile(path.join(cwd, filename), '{}')
  }
  const patterns = (YAML.parse(workspace.toString()) as { packages?: string[] }).packages
  const packages = await findWorkspacePackages(cwd, { ...(patterns ? { patterns } : {}) })
  const selected = new Set(packages.map(pkg => path.relative(cwd, path.join(pkg.rootDir, 'package.json'))))
  const selectedPortable = new Set([...selected].map(filename => filename.toLowerCase()))
  const seen = new Set<string>()
  for (const filename of manifests) {
    if (selectedPortable.has(filename.toLowerCase())) {
      if (seen.has(filename.toLowerCase())) {
        throw new Error('Workspace metadata paths collide on case-insensitive filesystems.')
      }
      seen.add(filename.toLowerCase())
    }
    if (!selected.has(filename)) {
      await rm(path.join(cwd, filename), { force: true })
    }
  }
  return selected
}

/** Copy inert metadata only: no source, npmrc, pnpmfile, hooks, modules or lockfile config dependencies. */
export async function writeMetadata(cwd: string, tree: GitTree, options: GitOptions): Promise<Metadata> {
  const original = new Map<string, Buffer>()
  const isolated = new Map<string, Buffer>()
  const workspaceEntry = tree.get('pnpm-workspace.yaml')
  if (!workspaceEntry || !tree.has('package.json')) {
    throw new Error('Frozen base must contain a pnpm workspace and its root manifest.')
  }
  const workspace = sanitizeWorkspace(readBlob(workspaceEntry, options))
  await writeFile(path.join(cwd, 'pnpm-workspace.yaml'), workspace)
  const manifests = await selectManifests(cwd, tree, workspace)
  const changelogs = new Set([...manifests].map(filename => path.join(path.dirname(filename), 'CHANGELOG.md')))
  for (const [filename, entry] of tree) {
    if (filename !== 'pnpm-workspace.yaml' && !manifests.has(filename) && !changelogs.has(filename)
      && !/^\.changeset\/[^/]+\.(?:md|yaml)$/.test(filename)) {
      continue
    }
    const bytes = readBlob(entry, options)
    original.set(filename, bytes)
    const content = filename === 'pnpm-workspace.yaml'
      ? workspace
      : filename.endsWith('package.json') ? sanitizeManifest(bytes) : bytes
    isolated.set(filename, content)
    await mkdir(path.dirname(path.join(cwd, filename)), { recursive: true })
    await writeFile(path.join(cwd, filename), content)
  }
  if (!original.has('package.json') || !original.has('pnpm-workspace.yaml')) {
    throw new Error('Frozen base must contain a pnpm workspace and its root manifest.')
  }
  return { original, isolated }
}

async function readFiles(cwd: string) {
  const files = new Map<string, Buffer>()
  async function walk(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        await walk(filename)
      }
      else if (entry.isFile()) {
        const relative = path.relative(cwd, filename)
        if (!metadataFile(relative)) {
          throw new Error(`Native replay produced unsupported output: ${relative}`)
        }
        files.set(relative, await readFile(filename))
      }
      else {
        throw new Error('Native replay produced a non-regular file.')
      }
    }
  }
  await walk(cwd)
  return files
}

export function sameContent(filename: string, left: Buffer | undefined, right: Buffer | undefined) {
  if (!left || !right) {
    return left === right
  }
  if (filename.endsWith('package.json')) {
    try {
      return isDeepStrictEqual(JSON.parse(left.toString()), JSON.parse(right.toString()))
    }
    catch {
      return false
    }
  }
  return left.equals(right)
}

/** Restore excluded fields before comparing: sanitization never exempts candidate script/config edits. */
export async function readExpected(cwd: string, metadata: Metadata) {
  const outputs = await readFiles(cwd)
  const expected = new Map(metadata.original)
  for (const filename of new Set([...metadata.isolated.keys(), ...outputs.keys()])) {
    const before = metadata.isolated.get(filename)
    const after = outputs.get(filename)
    if (sameContent(filename, before, after)) {
      continue
    }
    if (!after) {
      expected.delete(filename)
    }
    else if (filename.endsWith('package.json') && before) {
      const original = record(JSON.parse(metadata.original.get(filename)!.toString()))
      const next = record(JSON.parse(after.toString()))
      if (!isDeepStrictEqual(record(JSON.parse(before.toString()))['publishConfig'], next['publishConfig'])) {
        throw new Error('Native versioning unexpectedly changed the published package identity.')
      }
      for (const field of manifestFields) {
        if (field in next) {
          original[field] = next[field]
        }
        else {
          delete original[field]
        }
      }
      expected.set(filename, Buffer.from(JSON.stringify(original)))
    }
    else if (filename === 'pnpm-workspace.yaml' && before) {
      const document = YAML.parseDocument(metadata.original.get(filename)!.toString())
      const previous = record(YAML.parse(before.toString()))
      const next = record(YAML.parse(after.toString()))
      for (const field of workspaceFields) {
        if (!isDeepStrictEqual(previous[field], next[field])) {
          next[field] === undefined ? document.delete(field) : document.set(field, next[field])
        }
      }
      expected.set(filename, Buffer.from(document.toString()))
    }
    else {
      expected.set(filename, after)
    }
  }
  return expected
}
