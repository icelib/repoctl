import type { SnapshotBuildPlan, SnapshotSource } from './types'
import { createHash } from 'node:crypto'
import { valid } from 'semver'
import validatePackageName from 'validate-npm-package-name'
import { snapshotIdentity } from '../identity'

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Snapshot data must be a JSON object.')
  }
  return value as Record<string, unknown>
}

export function exactKeys(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) {
    throw new Error('Snapshot data contains missing or unexpected fields.')
  }
}

export function safeRelativePath(value: unknown, allowRoot = false): value is string {
  return typeof value === 'string' && value.length <= 1024 && ((allowRoot && value === '.')
    || (!/[\\:\p{Cc}]/u.test(value) && !value.startsWith('/') && value.split('/').every(part => part !== '' && part !== '.' && part !== '..')))
}

function positive(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function sha(value: unknown) {
  return typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value)
}

export function packageName(value: unknown): value is string {
  return typeof value === 'string' && validatePackageName(value).validForNewPackages
}

export function validateSnapshotSource(value: unknown): SnapshotSource {
  const source = object(value)
  exactKeys(source, ['repository', 'repositoryId', 'pullRequest', 'headSha', 'baseSha', 'baseRef', 'mergeSha', 'runId', 'runAttempt', 'workflowId', 'workflowPath', 'workflowSha', 'defaultBranch'])
  if (typeof source['repository'] !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(source['repository'])
    || !['repositoryId', 'pullRequest', 'runId', 'runAttempt', 'workflowId'].every(key => positive(source[key]))
    || !['headSha', 'baseSha', 'mergeSha', 'workflowSha'].every(key => sha(source[key]))
    || !['baseRef', 'defaultBranch'].every(key => typeof source[key] === 'string' && /^[\w./-]+$/.test(source[key] as string) && !(source[key] as string).includes('..'))
    || typeof source['workflowPath'] !== 'string' || !/^\.github\/workflows\/[\w.-]+\.ya?ml$/.test(source['workflowPath'])) {
    throw new Error('Snapshot source must contain complete, valid frozen GitHub identifiers.')
  }
  return value as SnapshotSource
}

export function canonicalSnapshotJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalSnapshotJson).join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonicalSnapshotJson(item)}`).join(',')}}`
  }
  const encoded = JSON.stringify(value)
  if (encoded === undefined) {
    throw new Error('Snapshot data must be JSON serializable.')
  }
  return encoded
}

export function snapshotPlanDigest(plan: SnapshotBuildPlan): string {
  return `sha256-${createHash('sha256').update(canonicalSnapshotJson(plan)).digest('hex')}`
}

/** Validate the complete frozen contract before using any artifact-controlled values. */
export function validateSnapshotBuildPlan(value: unknown): SnapshotBuildPlan {
  const plan = object(value)
  exactKeys(plan, ['schemaVersion', 'source', 'identity', 'identityKey', 'tag', 'registry', 'packageManager', 'packages'])
  const source = validateSnapshotSource(plan['source'])
  const identity = object(plan['identity'])
  exactKeys(identity, ['kind', 'pullRequest', 'commit', 'buildId'])
  const expected = snapshotIdentity({ cwd: '', identity: { kind: 'pr', pullRequest: source['pullRequest'], commit: source['mergeSha'], buildId: `run-${source['runId']}-attempt-${source['runAttempt']}` } })
  if (plan['schemaVersion'] !== 1 || canonicalSnapshotJson(identity) !== canonicalSnapshotJson(expected.identity)
    || plan['identityKey'] !== expected.key || plan['tag'] !== expected.tag || plan['registry'] !== 'https://registry.npmjs.org/'
    || typeof plan['packageManager'] !== 'string' || !/^pnpm@\d+\.\d+\.\d+(?:\+sha\d+\.[a-f0-9]+)?$/.test(plan['packageManager'])
    || !Array.isArray(plan['packages']) || !plan['packages'].length || plan['packages'].length > 1000) {
    throw new Error('Snapshot plan identity, package manager or publication target is invalid.')
  }
  const names = new Set<string>()
  const directories = new Set<string>()
  for (const value of plan['packages']) {
    const pkg = object(value)
    exactKeys(pkg, ['name', 'directory', 'currentVersion', 'version', 'reasons', 'dependencies'])
    if (!packageName(pkg['name']) || names.has(pkg['name']) || !safeRelativePath(pkg['directory'], true) || directories.has(pkg['directory'])
      || typeof pkg['currentVersion'] !== 'string' || !valid(pkg['currentVersion'])
      || typeof pkg['version'] !== 'string' || !valid(pkg['version'])
      || !pkg['version'].endsWith(`-snapshot.pr.${source['pullRequest']}.c${source['mergeSha']}.b${expected.key}`)
      || !Array.isArray(pkg['reasons']) || !pkg['reasons'].every(reason => typeof reason === 'string' && reason.length < 1000)
      || !Array.isArray(pkg['dependencies'])) {
      throw new Error('Snapshot plan contains an invalid or duplicate package.')
    }
    names.add(pkg['name'])
    directories.add(pkg['directory'])
  }
  for (const value of plan['packages']) {
    const pkg = object(value)
    const edges = new Set<string>()
    for (const value of pkg['dependencies'] as unknown[]) {
      const edge = object(value)
      exactKeys(edge, ['field', 'alias', 'name', 'version'])
      const target = (plan['packages'] as Record<string, unknown>[]).find(candidate => candidate['name'] === edge['name'])
      const key = `${edge['field']}.${edge['alias']}`
      if (!['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies'].includes(String(edge['field']))
        || !packageName(edge['alias']) || !target || edge['version'] !== target['version'] || edges.has(key)) {
        throw new Error('Snapshot plan contains an invalid dependency closure.')
      }
      edges.add(key)
    }
  }
  return value as SnapshotBuildPlan
}
