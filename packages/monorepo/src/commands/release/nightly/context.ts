import type { NightlyProvider, ReleaseNightlyConfig } from '../../../types/config'
import type { SnapshotIdentity } from '../snapshot/types'
import type { NightlyOptions } from './types'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import process from 'node:process'

interface NightlyEvent {
  repository?: { full_name?: string, default_branch?: string }
  inputs?: { mode?: string }
  schedule?: string
}

export async function nightlyContext(options: NightlyOptions, config: ReleaseNightlyConfig & { provider: NightlyProvider }) {
  const env = options.env ?? process.env
  if ((env['REPOCTL_NIGHTLY_PROVIDER'] !== undefined && env['REPOCTL_NIGHTLY_PROVIDER'] !== config.provider)
    || (env['REPOCTL_NIGHTLY_SCHEDULE'] !== undefined && env['REPOCTL_NIGHTLY_SCHEDULE'] !== (config.schedule ?? ''))) {
    throw new Error('Nightly workflow markers differ from commands.release.nightly; synchronize the workflow with repo upgrade.')
  }
  const repository = env['GITHUB_REPOSITORY'] ?? ''
  const commit = env['GITHUB_SHA'] ?? ''
  const eventName = env['GITHUB_EVENT_NAME'] ?? ''
  if (env['CI'] !== 'true' || env['GITHUB_ACTIONS'] !== 'true' || !/^[\w.-]+\/[\w.-]+$/.test(repository)
    || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commit) || !/^[1-9]\d*$/.test(env['GITHUB_RUN_ID'] ?? '')
    || !/^[1-9]\d*$/.test(env['GITHUB_RUN_ATTEMPT'] ?? '') || !env['GITHUB_EVENT_PATH']
    || !['schedule', 'workflow_dispatch'].includes(eventName)) {
    throw new Error('Nightly requires a GitHub Actions schedule or workflow_dispatch with a complete repository, commit and run identity.')
  }
  const event = JSON.parse(await readFile(env['GITHUB_EVENT_PATH'], 'utf8')) as NightlyEvent
  const branch = event.repository?.default_branch
  if (event.repository?.full_name !== repository || !branch || env['GITHUB_REF'] !== `refs/heads/${branch}`
    || (eventName === 'workflow_dispatch' && event.inputs?.mode !== 'nightly')) {
    throw new Error('Nightly requires the repository default branch and the nightly workflow dispatch mode.')
  }
  const buildId = config.provider === 'pkg-pr-new'
    ? `pkg-pr-new-${createHash('sha256').update(`${repository}\n${commit}`).digest('hex')}`
    : `${env['GITHUB_RUN_ID']}-${env['GITHUB_RUN_ATTEMPT']}`
  const identity: SnapshotIdentity = { kind: 'nightly', commit, buildId }
  const skipReason = eventName === 'schedule' && (!config.schedule || config.schedule !== event.schedule)
    ? 'This schedule is not enabled by commands.release.nightly.schedule.'
    : undefined
  return { repository, branch, commit, eventName, buildId, identity, skipReason }
}
