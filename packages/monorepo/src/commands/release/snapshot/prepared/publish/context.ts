import type { SnapshotReport } from '../../types'
import type { PreparedSnapshotManifest } from '../types'
import type { PreparedSnapshotPublishOptions } from './types'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { consumerEnvironment } from '../../../nightly/consumer/environment'
import { emptyReleasePlan } from '../../../plan/native-report'

export async function publisherEnvironment(options: PreparedSnapshotPublishOptions, manifest: PreparedSnapshotManifest, directory: string) {
  const env = options.env ?? process.env
  const { source } = manifest.plan
  const workflow = options.publisherWorkflowPath ?? '.github/workflows/repoctl-snapshot-publish.yml'
  const expected = `${source.repository}/${workflow}@refs/heads/${source.defaultBranch}`
  if (!/^\.github\/workflows\/[\w.-]+\.ya?ml$/u.test(workflow)
    || env['GITHUB_ACTIONS'] !== 'true' || env['GITHUB_EVENT_NAME'] !== 'workflow_run'
    || env['GITHUB_REPOSITORY'] !== source.repository || env['GITHUB_WORKFLOW_REF'] !== expected
    || env['GITHUB_REF'] !== `refs/heads/${source.defaultBranch}` || !env['GITHUB_EVENT_PATH']) {
    throw new Error('Prepared snapshot publication requires its trusted default-branch workflow_run publisher.')
  }
  const event = JSON.parse(await readFile(env['GITHUB_EVENT_PATH'], 'utf8'))
  if (event.repository?.id !== source.repositoryId || event.repository?.full_name !== source.repository
    || event.workflow_run?.id !== source.runId || event.workflow_run?.run_attempt !== source.runAttempt
    || event.workflow_run?.conclusion !== 'success') {
    throw new Error('Publisher event does not identify the verified source run and attempt.')
  }
  const clean = consumerEnvironment(env, directory)
  for (const [key, value] of Object.entries(env)) {
    if (/^(?:GITHUB_|ACTIONS_ID_TOKEN_REQUEST_|RUNNER_)/u.test(key) && value !== undefined) {
      clean[key] = value
    }
  }
  // GitHub API access belongs to verification, not the npm subprocess.
  delete clean['GITHUB_TOKEN']
  return clean
}

/** Adapt checked portable data to the existing upload/confirmation engine. */
export function snapshotPublicationReport(manifest: PreparedSnapshotManifest, directory: string): SnapshotReport {
  const plan = manifest.plan
  const args = ['add', ...manifest.packages.map(pkg => `${pkg.name}@${pkg.version}`), '--registry', plan.registry]
  return {
    schemaVersion: 1,
    identity: plan.identity,
    identityKey: plan.identityKey,
    source: directory,
    tag: plan.tag,
    registry: plan.registry,
    status: 'prepared',
    packages: plan.packages.map((pkg) => {
      const artifact = manifest.packages.find(item => item.name === pkg.name)!
      return { ...pkg, tarball: path.join(directory, artifact.tarball), integrity: artifact.integrity }
    }),
    nativePlan: emptyReleasePlan({ cwd: directory }),
    install: { executable: 'pnpm', args },
    installCommand: `pnpm ${args.join(' ')}`,
    outputDirectory: directory,
  }
}
