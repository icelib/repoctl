import { readdir, readFile, realpath } from 'node:fs/promises'
import path from 'pathe'
import semver from 'semver'
import YAML from 'yaml'
import { getWorkspacePackages } from '../../../core/workspace'
import { ReleaseCommandError } from '../errors'

export interface LedgerEntry { dir?: string, intents: string[] }
export type ReleaseLedger = Record<string, LedgerEntry>

export function isIntentConsumed(ledger: ReleaseLedger, intentId: string, name: string, dir: string, lane?: string) {
  return Object.entries(ledger).some(([key, entry]) => (entry.dir ? entry.dir.replace(/^\.\//, '') === dir : key.slice(0, key.lastIndexOf('@')) === name)
    && entry.intents.includes(intentId)
    && ((lane && lane !== 'main') || !semver.prerelease(key.slice(key.lastIndexOf('@') + 1))))
}

export function parseLedger(content: string): ReleaseLedger {
  const ledger: unknown = YAML.parse(content) ?? {}
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) {
    throw new ReleaseCommandError('Invalid .changeset/ledger.yaml')
  }
  return Object.fromEntries(Object.entries(ledger).map(([key, value]) => {
    const entry = value as { dir?: unknown, intents?: unknown } | null
    const intents = Array.isArray(value) ? value : entry?.intents ?? []
    if ((value != null && !Array.isArray(value) && (typeof value !== 'object' || typeof entry?.dir !== 'string'))
      || !Array.isArray(intents) || intents.some(id => typeof id !== 'string')) {
      throw new ReleaseCommandError(`Invalid ledger entry: ${key}`)
    }
    return [key, { ...(typeof entry?.dir === 'string' ? { dir: entry.dir } : {}), intents }]
  }))
}

export async function readLedger(cwd: string) {
  try {
    return parseLedger(await readFile(path.join(cwd, '.changeset/ledger.yaml'), 'utf8'))
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {}
    }
    throw error
  }
}

export function parseIntent(content: string, filename: string) {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/)
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
  if (lines[0]?.trim() !== '---' || end < 0) {
    throw new ReleaseCommandError(`Invalid change intent frontmatter: ${filename}`)
  }
  let data: unknown
  try {
    data = YAML.parse(lines.slice(1, end).join('\n')) ?? {}
  }
  catch {
    throw new ReleaseCommandError(`Invalid change intent YAML: ${filename}`)
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)
    || Object.values(data).some(value => !['none', 'patch', 'minor', 'major'].includes(String(value)))) {
    throw new ReleaseCommandError(`Invalid change intent bump type: ${filename}`)
  }
  return Object.entries(data) as Array<[string, 'none' | 'patch' | 'minor' | 'major']>
}

/** Only unconsumed release requests count; declines and resurrected prose do not. */
export async function readPendingIntents(cwd: string) {
  let files
  try {
    files = await readdir(path.join(cwd, '.changeset'), { withFileTypes: true })
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }
    throw error
  }
  const root = await realpath(cwd)
  const ledger = await readLedger(cwd)
  const config = YAML.parse(await readFile(path.join(cwd, 'pnpm-workspace.yaml'), 'utf8')) as { versioning?: { lanes?: Record<string, string> } }
  // Match pnpm's versioning domain, including packages that will never be published.
  const workspace = await getWorkspacePackages(cwd, { ignorePrivatePackage: false, ignoreRootPackage: false })
  const pending: string[] = []
  for (const file of files.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!file.isFile() || !file.name.endsWith('.md') || file.name.toLowerCase() === 'readme.md') {
      continue
    }
    const filename = `.changeset/${file.name}`
    const releases = parseIntent(await readFile(path.join(cwd, filename), 'utf8'), filename)
    let active = false
    for (const [reference, bump] of releases) {
      if (bump === 'none') {
        continue
      }
      const pkg = workspace.find(item => item.manifest.name === reference
        || (path.relative(root, item.rootDir) || '.') === (reference.replace(/^\.\//, '') || '.'))
      if (!pkg) {
        throw new ReleaseCommandError(`Unknown package ${reference} in ${filename}`)
      }
      const dir = path.relative(root, pkg.rootDir) || '.'
      const lane = config.versioning?.lanes?.[pkg.manifest.name ?? ''] ?? config.versioning?.lanes?.[dir]
      const consumed = isIntentConsumed(ledger, file.name.slice(0, -3), pkg.manifest.name ?? '', dir, lane)
      active ||= !consumed
    }
    if (active) {
      pending.push(filename)
    }
  }
  return pending
}
