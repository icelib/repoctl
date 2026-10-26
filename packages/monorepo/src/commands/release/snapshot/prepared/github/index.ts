import type { VerifiedSnapshotRun, VerifySnapshotRunOptions } from './types'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { canonicalSnapshotJson, snapshotPlanDigest, validateSnapshotBuildPlan } from '../schema'
import { validatePreparedSnapshot } from '../validate'
import { downloadSnapshotArtifact } from './archive'
import { createSnapshotGitHub, digest, positive, record } from './client'
import { verifySnapshotJobs } from './evidence'
import { assertSnapshotSourceCurrent, readSnapshotRun } from './source'

export { createSnapshotFreezeRecord } from './evidence'
export { freezeSnapshotSource } from './source'
export type { FreezeSnapshotSourceOptions, SnapshotArtifactEvidence, SnapshotFreezeRecord, SnapshotGitHubOptions, SnapshotRunEvidence, SnapshotWorkflowPolicy, VerifiedSnapshotRun, VerifySnapshotRunOptions } from './types'

/** Verify GitHub evidence and portable artifacts without executing any candidate code. */
export async function verifySnapshotRun(options: VerifySnapshotRunOptions): Promise<VerifiedSnapshotRun> {
  const client = createSnapshotGitHub(options)
  const context = await readSnapshotRun(client, { ...options, workflowPath: options.policy.workflowPath }, true)
  const workflow = record(await client.json(`/contents/${options.policy.workflowPath}?ref=${context.workflowSha}`))
  if (workflow['type'] !== 'file' || workflow['encoding'] !== 'base64' || typeof workflow['content'] !== 'string'
    || digest(options.policy.workflowSha256) !== `sha256:${createHash('sha256').update(Buffer.from(workflow['content'], 'base64')).digest('hex')}`) {
    throw new Error('Snapshot builder workflow bytes do not match the trusted publisher policy.')
  }
  const jobs = await verifySnapshotJobs(client, options)
  const source = jobs.frozen.source
  if (source.repository !== options.repository || source.repositoryId !== context.repositoryId
    || source.runId !== options.runId || source.runAttempt !== options.runAttempt
    || source.workflowId !== context.workflowId || source.workflowPath !== options.policy.workflowPath
    || source.workflowSha !== context.workflowSha || source.defaultBranch !== context.defaultBranch) {
    throw new Error('Trusted freeze evidence belongs to a different repository, workflow or attempt.')
  }
  const planFiles = await downloadSnapshotArtifact(client, {
    artifact: jobs.frozen.artifact,
    name: `snapshot-plan-${options.runId}-${options.runAttempt}`,
    runId: options.runId,
    repositoryId: context.repositoryId,
    workflowSha: context.workflowSha,
  })
  if (planFiles.size !== 1 || !planFiles.has('snapshot-plan.json') || planFiles.get('snapshot-plan.json')!.byteLength > 8 * 1024 * 1024) {
    throw new Error('Trusted plan artifact must contain only snapshot-plan.json.')
  }
  const plan = validateSnapshotBuildPlan(JSON.parse(Buffer.from(planFiles.get('snapshot-plan.json')!).toString('utf8')))
  if (canonicalSnapshotJson(plan.source) !== canonicalSnapshotJson(source) || snapshotPlanDigest(plan) !== jobs.frozen.planDigest) {
    throw new Error('Snapshot plan bytes do not match the trusted freeze job record.')
  }
  const artifacts = await client.list(`/actions/runs/${options.runId}/artifacts`, 'artifacts')
  const name = `snapshot-build-${options.runId}-${options.runAttempt}`
  const candidates = artifacts.filter(artifact => artifact['name'] === name)
  if (candidates.length !== 1 || (options.artifactId !== undefined && candidates[0]!['id'] !== positive(options.artifactId, 'build artifact ID'))) {
    throw new Error('Snapshot builder must have exactly one matching immutable build artifact.')
  }
  const buildArtifact = { id: positive(candidates[0]!['id'], 'build artifact ID'), digest: digest(candidates[0]!['digest']) }
  const files = await downloadSnapshotArtifact(client, { artifact: buildArtifact, name, runId: options.runId, repositoryId: context.repositoryId, workflowSha: context.workflowSha })
  const encoded = files.get('snapshot-manifest.json')
  if (!encoded || encoded.byteLength > 8 * 1024 * 1024) {
    throw new Error('Snapshot build artifact has no valid bounded manifest.')
  }
  const manifest = await validatePreparedSnapshot(JSON.parse(Buffer.from(encoded).toString('utf8')), plan, files)
  const assertCurrent = async () => {
    const current = await readSnapshotRun(client, { ...options, workflowPath: options.policy.workflowPath }, true)
    if (current.workflowSha !== source.workflowSha || current.workflowId !== source.workflowId || current.repositoryId !== source.repositoryId) {
      throw new Error('Snapshot source workflow identity changed during verification.')
    }
    await assertSnapshotSourceCurrent(client, source)
  }
  await assertCurrent()
  return {
    plan,
    manifest,
    files,
    evidence: { source, freezeJobId: jobs.freezeJobId, buildJobId: jobs.buildJobId, planArtifact: jobs.frozen.artifact, buildArtifact, planDigest: jobs.frozen.planDigest },
    assertCurrent,
  }
}
