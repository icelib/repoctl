import type { SnapshotIdentity, SnapshotOptions, SnapshotReport } from './types'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { snapshotCommand } from './process'

export function snapshotMetadata(report: SnapshotReport) {
  return { ...report.identity, identityKey: report.identityKey, tag: report.tag }
}

export function matchesSnapshotMetadata(value: unknown, report: SnapshotReport) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const expected = snapshotMetadata(report)
  const actual = value as Record<string, unknown>
  return Object.keys(actual).length === Object.keys(expected).length
    && Object.entries(expected).every(([key, expectedValue]) => actual[key] === expectedValue)
}

export function snapshotIdentity(options: SnapshotOptions) {
  const identity = options.identity
  if (!identity || !['pr', 'nightly'].includes(identity.kind) || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(identity.commit)
    || typeof identity.buildId !== 'string' || !identity.buildId.trim() || identity.buildId.length > 128
    || (identity.kind === 'pr' && (!Number.isSafeInteger(identity.pullRequest) || identity.pullRequest <= 0))) {
    throw new Error('Snapshot identity requires pr/nightly, a full lowercase commit, a nonempty buildId (at most 128 characters), and a positive PR number for pr.')
  }
  const normalized: SnapshotIdentity = identity.kind === 'pr'
    ? { kind: 'pr', pullRequest: identity.pullRequest, commit: identity.commit, buildId: identity.buildId }
    : { kind: 'nightly', commit: identity.commit, buildId: identity.buildId }
  const key = createHash('sha256').update(JSON.stringify(normalized)).digest('hex')
  return { identity: normalized, key, tag: identity.kind === 'pr' ? `snapshot-pr-${identity.pullRequest}` : 'snapshot-nightly' }
}

export function assertSnapshotSource(options: SnapshotOptions) {
  const root = snapshotCommand('git', ['rev-parse', '--show-toplevel'], options)
  if (snapshotCommand('git', ['rev-parse', 'HEAD'], options) !== options.identity.commit) {
    throw new Error('Snapshot commit must exactly match the checked-out HEAD.')
  }
  if (snapshotCommand('git', ['--no-optional-locks', 'status', '--porcelain', '--untracked-files=all'], options)) {
    throw new Error('Snapshot preparation requires a clean committed source tree, including untracked files.')
  }
  return root
}

export async function assertSnapshotAuthorization(options: SnapshotOptions) {
  const env = options.env ?? process.env
  if (env['REPOCTL_SNAPSHOT_PUBLISH'] !== '1' || env['CI'] !== 'true' || env['GITHUB_ACTIONS'] !== 'true'
    || env['GITHUB_SHA'] !== options.identity.commit || !env['GITHUB_REPOSITORY'] || !env['GITHUB_EVENT_PATH']) {
    throw new Error('Snapshot publication requires REPOCTL_SNAPSHOT_PUBLISH=1 in a trusted GitHub Actions job matching the full source commit.')
  }
  const event = JSON.parse(await readFile(env['GITHUB_EVENT_PATH'], 'utf8'))
  if (event.repository?.full_name !== env['GITHUB_REPOSITORY']) {
    throw new Error('Snapshot event repository does not match the authorized repository.')
  }
  if (options.identity.kind === 'pr') {
    const pr = event.pull_request
    if (env['GITHUB_EVENT_NAME'] !== 'pull_request' || event.number !== options.identity.pullRequest || !pr
      || pr.head?.repo?.fork !== false || pr.head?.repo?.full_name !== env['GITHUB_REPOSITORY']
      || pr.base?.repo?.full_name !== env['GITHUB_REPOSITORY']
      || ![pr.head?.sha, pr.merge_commit_sha].includes(options.identity.commit)) {
      throw new Error('Snapshot PR publication requires a same-repository pull_request event; fork and pull_request_target jobs cannot publish.')
    }
  }
  else if (!['schedule', 'workflow_dispatch'].includes(env['GITHUB_EVENT_NAME'] ?? '')) {
    throw new Error('Nightly snapshot publication requires a schedule or workflow_dispatch event.')
  }
}
