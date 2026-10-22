import type { DocsSiteConfig } from '../../types/docs'
import type { DocsIdentity } from './config'
import type { DocsDeploymentState } from './types'
import { resolveCommandValues } from '../../core/config/resolution'
import { validateSite } from './config'
import { assertSha } from './git'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertIdentity(value: unknown) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error('Invalid documentation deployment identity in persisted state')
  }
}

function assertCommits(value: unknown) {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string') || new Set(value).size !== value.length) {
    throw new Error('Invalid documentation corrections in persisted state')
  }
  value.forEach(commit => assertSha(commit, 'Correction'))
}

function assertStableSnapshot(value: unknown) {
  if (!isObject(value) || typeof value['sourceSha'] !== 'string' || typeof value['treeSha'] !== 'string' || !isObject(value['config'])) {
    throw new Error('Invalid frozen stable documentation snapshot in persisted state')
  }
  assertIdentity(value['releaseId'])
  assertSha(value['sourceSha'])
  assertSha(value['treeSha'], 'Source tree')
  assertCommits(value['commits'])
  assertCommits(value['requestedCommits'])
  const config = value['config'] as unknown as DocsSiteConfig
  resolveCommandValues('docs', { sites: { frozen: config } })
  validateSite(config)
}

export async function readDocsState(context: DocsIdentity, site: string, channel: 'preview' | 'stable') {
  const snapshot = await context.github.readAutomationState(context.key)
  if (!snapshot) {
    return { state: { schemaVersion: 1, repository: context.repository, site, channel } as DocsDeploymentState }
  }
  const value = snapshot.value
  if (!isObject(value) || value['schemaVersion'] !== 1 || value['repository'] !== context.repository || value['site'] !== site || value['channel'] !== channel) {
    throw new Error('Documentation checkpoint does not match this repository, site and channel')
  }
  if (value['current'] !== undefined) {
    const current = value['current']
    if (!isObject(current) || typeof current['sourceSha'] !== 'string' || typeof current['treeSha'] !== 'string'
      || typeof current['versionId'] !== 'string' || !current['versionId']) {
      throw new Error('Invalid current documentation checkpoint')
    }
    assertIdentity(current['deploymentId'])
    assertSha(current['sourceSha'])
    assertSha(current['treeSha'], 'Source tree')
    assertCommits(current['commits'])
    if (channel === 'stable') {
      assertIdentity(current['releaseId'])
    }
  }
  if (value['pending'] !== undefined) {
    const pending = value['pending']
    if (!isObject(pending) || typeof pending['runId'] !== 'string' || !pending['runId'] || !['building', 'deploying'].includes(String(pending['phase']))) {
      throw new Error('Invalid pending documentation checkpoint')
    }
    assertIdentity(pending['deploymentId'])
    if (channel === 'stable') {
      assertStableSnapshot(pending['snapshot'])
    }
  }
  return { state: value as unknown as DocsDeploymentState, revision: snapshot.revision }
}
