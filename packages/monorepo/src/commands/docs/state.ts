import type { DocsSiteConfig } from '../../types/docs'
import type { DocsIdentity } from './config'
import type { DocsDeploymentState } from './types'
import { resolveCommandValues } from '../../core/config/resolution'
import { validateSite } from './config'
import { DocsDiagnosticError } from './diagnostics'
import { assertSha } from './git'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertIdentity(value: unknown) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new DocsDiagnosticError('checkpoint-invalid')
  }
}

function assertCommits(value: unknown) {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string') || new Set(value).size !== value.length) {
    throw new DocsDiagnosticError('checkpoint-invalid')
  }
  value.forEach(commit => assertSha(commit, 'Correction'))
}

export function assertProviderReceipt(value: unknown) {
  if (!isObject(value) || typeof value['versionId'] !== 'string' || !value['versionId'].trim()
    || value['versionId'].length > 512 || /[\p{Cc}\p{Cf}]/u.test(value['versionId'])
    || Object.keys(value).some(key => !['versionId', 'url'].includes(key))) {
    throw new DocsDiagnosticError('receipt-invalid')
  }
  if (value['url'] !== undefined) {
    let url: URL
    try {
      url = new URL(String(value['url']))
    }
    catch {
      throw new DocsDiagnosticError('receipt-invalid')
    }
    if (typeof value['url'] !== 'string' || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new DocsDiagnosticError('receipt-invalid')
    }
  }
}

function assertStableSnapshot(value: unknown) {
  if (!isObject(value) || typeof value['sourceSha'] !== 'string' || typeof value['treeSha'] !== 'string' || !isObject(value['config'])) {
    throw new DocsDiagnosticError('checkpoint-invalid')
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
  const snapshot = await context.github.readAutomationState(context.key).catch(() => {
    throw new DocsDiagnosticError('checkpoint-read-failed')
  })
  if (!snapshot) {
    return { state: { schemaVersion: 1, repository: context.repository, site, channel } as DocsDeploymentState }
  }
  const value = snapshot.value
  if (!isObject(value) || value['schemaVersion'] !== 1 || value['repository'] !== context.repository || value['site'] !== site || value['channel'] !== channel) {
    throw new DocsDiagnosticError('checkpoint-invalid')
  }
  if (value['current'] !== undefined) {
    const current = value['current']
    if (!isObject(current) || typeof current['sourceSha'] !== 'string' || typeof current['treeSha'] !== 'string'
      || typeof current['versionId'] !== 'string' || !current['versionId']) {
      throw new DocsDiagnosticError('checkpoint-invalid')
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
    if (!isObject(pending) || typeof pending['runId'] !== 'string' || !pending['runId']
      || typeof pending['phase'] !== 'string' || !['building', 'deploying', 'verifying'].includes(pending['phase'])) {
      throw new DocsDiagnosticError('checkpoint-invalid')
    }
    assertIdentity(pending['deploymentId'])
    if (channel === 'stable') {
      assertStableSnapshot(pending['snapshot'])
    }
    if (pending['phase'] === 'verifying') {
      assertProviderReceipt(pending['receipt'])
      if (channel === 'stable' && !(pending['snapshot'] as unknown as { config: DocsSiteConfig }).config.stable.readiness) {
        throw new DocsDiagnosticError('checkpoint-invalid')
      }
    }
    else if (pending['receipt'] !== undefined) {
      throw new DocsDiagnosticError('checkpoint-invalid')
    }
  }
  return { state: value as unknown as DocsDeploymentState, revision: snapshot.revision }
}

export async function writeDocsState(context: DocsIdentity, state: DocsDeploymentState, revision?: string) {
  try {
    return await context.github.writeAutomationState(context.key, state, revision)
  }
  catch {
    throw new DocsDiagnosticError('checkpoint-write-failed')
  }
}
