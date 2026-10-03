import type { MaintenanceVersionChange } from './types'
import { valid } from 'semver'
import { lockfileRecord, parseWorkspaceLockfile } from '../../core/lockfile'

export function lockedMaintenanceVersion(source: string, packageName = 'repoctl', exact = false): string | null {
  const lock = parseWorkspaceLockfile(source)
  if (!lock) {
    throw new Error('Unsupported or ambiguous pnpm workspace lockfile; expected one v9 workspace document.')
  }
  const root = lockfileRecord(lockfileRecord(lock['importers'])?.['.'])!
  const entries = ['dependencies', 'devDependencies', 'optionalDependencies'].flatMap((group) => {
    const map = lockfileRecord(root[group])
    if (root[group] !== undefined && !map) {
      throw new Error(`Unsupported root ${group} lockfile entry.`)
    }
    return map && Object.hasOwn(map, packageName) ? [map[packageName]] : []
  })
  if (!entries.length) {
    return null
  }
  const entry = entries.length === 1 ? lockfileRecord(entries[0]) : undefined
  const raw = entry?.['version']
  if (typeof raw !== 'string' || typeof entry?.['specifier'] !== 'string') {
    throw new TypeError(`The root ${packageName} lockfile entry is ambiguous or unsupported.`)
  }
  const version = raw.split('(')[0]!
  let depth = 0
  for (const character of raw.slice(version.length)) {
    if (character === '(') {
      depth++
    }
    else if (character === ')') {
      if (--depth < 0) {
        throw new Error(`Malformed ${packageName} peer resolution suffix.`)
      }
    }
    else if (depth === 0 || /\s/.test(character)) {
      throw new Error(`Unsupported ${packageName} resolution suffix.`)
    }
  }
  if (!valid(version) || valid(version) !== version || depth !== 0) {
    throw new Error(`Maintenance supports an exact registry ${packageName} version, not links, aliases or opaque resolutions.`)
  }
  if (exact && entry?.['specifier'] !== version) {
    throw new Error(`Maintenance requires an exact root lockfile specifier for ${packageName}.`)
  }
  return version
}

/** Compare resolved root versions; unrelated dependency and peer-context changes are no-ops. */
export function detectMaintenanceVersionChange(before: string, after: string): MaintenanceVersionChange {
  try {
    const from = lockedMaintenanceVersion(before)
    const to = lockedMaintenanceVersion(after)
    if (from === to) {
      return { status: 'unchanged', from, to, reason: 'root-repoctl-version-unchanged' }
    }
    if (!from || !to) {
      return { status: 'blocked', from, to, reason: 'A versioned root repoctl dependency is required on both sides; installation and removal require manual review.' }
    }
    return { status: 'changed', from, to, reason: 'root-repoctl-version-changed' }
  }
  catch (error) {
    return { status: 'blocked', from: null, to: null, reason: error instanceof Error ? error.message : String(error) }
  }
}
