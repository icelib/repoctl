import type { GitHubOperations } from '../github'
import type { ReleaseCompletionRecord } from './types'
import { createHash } from 'node:crypto'
import semver from 'semver'
import { ReleaseCommandError } from '../errors'

export function completionId(value: Omit<ReleaseCompletionRecord, 'id'>) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function parseReleaseCompletion(value: unknown, id: string): ReleaseCompletionRecord {
  if (!isRecord(value) || value['schemaVersion'] !== 1 || value['id'] !== id || !/^[a-f0-9]{64}$/.test(id)
    || typeof value['repository'] !== 'string' || !/^[^/]+\/[^/]+$/.test(value['repository'])
    || value['branch'] !== 'main' || value['distTag'] !== 'latest'
    || typeof value['sourceSha'] !== 'string' || !/^[a-f0-9]{40}$/.test(value['sourceSha'])
    || typeof value['checkpointKey'] !== 'string' || !/^[a-f0-9]{64}$/.test(value['checkpointKey'])
    || !Array.isArray(value['packages']) || !value['packages'].length
    || !Array.isArray(value['releasedPackages']) || !value['releasedPackages'].length) {
    throw new ReleaseCommandError('Invalid stable release completion record')
  }
  const packages = value['packages'].map((pkg) => {
    if (!isRecord(pkg) || typeof pkg['name'] !== 'string' || !pkg['name']
      || typeof pkg['version'] !== 'string' || !semver.valid(pkg['version']) || semver.prerelease(pkg['version'])
      || typeof pkg['sourceSha'] !== 'string' || !/^[a-f0-9]{40}$/.test(pkg['sourceSha'])) {
      throw new ReleaseCommandError('Invalid package in stable release completion record')
    }
    return { name: pkg['name'], version: pkg['version'], sourceSha: pkg['sourceSha'] }
  })
  if (new Set(packages.map(pkg => pkg['name'])).size !== packages.length
    || value['releasedPackages'].some(name => typeof name !== 'string' || !packages.some(pkg => pkg['name'] === name && pkg['sourceSha'] === value['sourceSha']))
    || new Set(value['releasedPackages']).size !== value['releasedPackages'].length) {
    throw new ReleaseCommandError('Invalid stable release package cohort')
  }
  const record: Omit<ReleaseCompletionRecord, 'id'> = {
    schemaVersion: 1,
    repository: value['repository'],
    branch: value['branch'],
    distTag: value['distTag'],
    sourceSha: value['sourceSha'],
    packages,
    releasedPackages: value['releasedPackages'] as string[],
    checkpointKey: value['checkpointKey'],
  }
  if (completionId(record) !== id) {
    throw new ReleaseCommandError('Stable release completion identity mismatch')
  }
  return { ...record, id }
}

export async function readReleaseCompletion(github: Pick<GitHubOperations, 'readAutomationState'>, id: string) {
  if (!github.readAutomationState || !/^[a-f0-9]{64}$/.test(id)) {
    throw new ReleaseCommandError('A valid persisted release completion ID is required')
  }
  const snapshot = await github.readAutomationState(`releases/${id}`)
  if (!snapshot) {
    throw new ReleaseCommandError(`Stable release completion record is missing: ${id}`)
  }
  return parseReleaseCompletion(snapshot.value, id)
}
