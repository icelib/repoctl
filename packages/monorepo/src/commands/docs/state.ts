import type { DocsContext } from './config'
import type { DocsDeploymentState } from './types'
import { assertSha } from './git'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertIdentity(value: unknown) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error('Invalid documentation deployment identity in persisted state')
  }
}

export async function readDocsState(context: DocsContext, site: string, channel: 'preview' | 'stable') {
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
      || !Array.isArray(current['commits']) || current['commits'].some(item => typeof item !== 'string')
      || typeof current['versionId'] !== 'string' || !current['versionId']) {
      throw new Error('Invalid current documentation checkpoint')
    }
    assertIdentity(current['deploymentId'])
    assertSha(current['sourceSha'])
    assertSha(current['treeSha'], 'Source tree')
    current['commits'].forEach(commit => assertSha(commit as string, 'Correction'))
    if (channel === 'stable') {
      assertIdentity(current['releaseId'])
    }
  }
  if (value['pending'] !== undefined) {
    const pending = value['pending']
    if (!isObject(pending) || typeof pending['runId'] !== 'string' || !['building', 'deploying'].includes(String(pending['phase']))) {
      throw new Error('Invalid pending documentation checkpoint')
    }
    assertIdentity(pending['deploymentId'])
  }
  return { state: value as unknown as DocsDeploymentState, revision: snapshot.revision }
}
