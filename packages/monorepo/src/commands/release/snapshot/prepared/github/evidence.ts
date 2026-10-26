import type { SnapshotBuildPlan } from '../types'
import type { SnapshotGitHub } from './client'
import type { GitHubRecord, SnapshotArtifactEvidence, SnapshotFreezeRecord, VerifySnapshotRunOptions } from './types'
import { Buffer } from 'node:buffer'
import { canonicalSnapshotJson, exactKeys, snapshotPlanDigest, validateSnapshotBuildPlan, validateSnapshotSource } from '../schema'
import { digest, positive, record } from './client'

const marker = 'REPOCTL_SNAPSHOT_FREEZE_V1:'

/** Print only after the trusted freeze job has uploaded its immutable plan artifact. */
export function createSnapshotFreezeRecord(plan: SnapshotBuildPlan, artifact: SnapshotArtifactEvidence): string {
  const value: SnapshotFreezeRecord = {
    schemaVersion: 1,
    source: validateSnapshotBuildPlan(plan).source,
    planDigest: snapshotPlanDigest(plan),
    artifact: { id: positive(artifact.id, 'plan artifact ID'), digest: digest(artifact.digest) },
  }
  return `${marker}${Buffer.from(canonicalSnapshotJson(value)).toString('base64url')}`
}

export function readSnapshotFreezeRecord(logs: string): SnapshotFreezeRecord {
  const lines = logs.split(/\r?\n/).map(line => line.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z /, '')).filter(line => line.startsWith(marker))
  if (lines.length !== 1 || !/^REPOCTL_SNAPSHOT_FREEZE_V1:[\w-]{1,16384}$/.test(lines[0]!)) {
    throw new Error('Trusted freeze job must contain exactly one complete snapshot evidence record.')
  }
  const encoded = lines[0]!.slice(marker.length)
  const bytes = Buffer.from(encoded, 'base64url')
  if (bytes.toString('base64url') !== encoded) {
    throw new Error('Trusted freeze record encoding is invalid.')
  }
  const value = record(JSON.parse(bytes.toString('utf8')), 'freeze record')
  exactKeys(value, ['schemaVersion', 'source', 'planDigest', 'artifact'])
  const artifact = record(value['artifact'])
  exactKeys(artifact, ['id', 'digest'])
  if (value['schemaVersion'] !== 1 || typeof value['planDigest'] !== 'string' || !/^sha256-[a-f\d]{64}$/.test(value['planDigest'])) {
    throw new Error('Trusted freeze record schema or plan digest is invalid.')
  }
  return {
    schemaVersion: 1,
    source: validateSnapshotSource(value['source']),
    planDigest: value['planDigest'],
    artifact: { id: positive(artifact['id'], 'plan artifact ID'), digest: digest(artifact['digest']) },
  }
}

function completedJob(jobs: GitHubRecord[], name: string, options: VerifySnapshotRunOptions) {
  const matches = jobs.filter(job => job['name'] === name)
  const job = matches[0]
  if (matches.length !== 1 || !job || job['run_id'] !== options.runId || job['run_attempt'] !== options.runAttempt
    || job['status'] !== 'completed' || job['conclusion'] !== 'success') {
    throw new Error('Snapshot freeze and build must both succeed in the current attempt; re-run all builder jobs for a fresh approval.')
  }
  positive(job['id'], 'job ID')
  for (const key of ['started_at', 'completed_at']) {
    if (typeof job[key] !== 'string' || !Number.isFinite(Date.parse(job[key] as string))) {
      throw new TypeError('GitHub job evidence has no valid execution timestamps.')
    }
  }
  if (Date.parse(String(job['started_at'])) > Date.parse(String(job['completed_at']))) {
    throw new Error('GitHub job timestamps are inconsistent.')
  }
  return job
}

export async function verifySnapshotJobs(client: SnapshotGitHub, options: VerifySnapshotRunOptions) {
  const jobs = await client.list(`/actions/runs/${options.runId}/attempts/${options.runAttempt}/jobs`, 'jobs')
  const freeze = completedJob(jobs, options.policy.freezeJobName ?? 'Freeze snapshot plan', options)
  const build = completedJob(jobs, options.policy.buildJobName ?? 'Build snapshot packages', options)
  if (freeze['id'] === build['id'] || Date.parse(String(freeze['completed_at'])) > Date.parse(String(build['started_at']))) {
    throw new Error('Candidate execution must start after the trusted plan has been frozen.')
  }
  const environment = record(await client.json(`/environments/${encodeURIComponent(options.policy.environment)}`))
  const rules = environment['protection_rules']
  if (environment['name'] !== options.policy.environment || environment['can_admins_bypass'] !== false || !Array.isArray(rules)
    || !rules.some(value => record(value)['type'] === 'required_reviewers'
      && Array.isArray(record(value)['reviewers']) && (record(value)['reviewers'] as unknown[]).length > 0)) {
    throw new Error('Snapshot freezing requires a protected reviewer environment without administrator bypass.')
  }
  const environmentId = positive(environment['id'], 'approval environment ID')
  const approvals = await client.list(`/actions/runs/${options.runId}/approvals`)
  if (!approvals.some(approval => approval['state'] === 'approved' && Array.isArray(approval['environments'])
    && (approval['environments'] as unknown[]).some(value => record(value)['id'] === environmentId && record(value)['name'] === options.policy.environment))) {
    throw new Error('Snapshot builder has no verified approval for its protected freeze environment.')
  }
  const logs = await client.binary(`/actions/jobs/${freeze['id']}/logs`, 16 * 1024 * 1024)
  return { freezeJobId: Number(freeze['id']), buildJobId: Number(build['id']), frozen: readSnapshotFreezeRecord(Buffer.from(logs).toString('utf8')) }
}
