import type { AutoChangesetGitHub } from './github/client'
import type { AutoChangesetApplyOptions, AutoChangesetRevision } from './types'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import YAML from 'yaml'
import { positive, record } from './github/client'
import { readBlob, readTree } from './github/tree'
import { workflowConfiguration } from './workflow'

function timestamp(value: unknown) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new TypeError('Missing GitHub job execution timestamp.')
  }
  return Date.parse(value)
}

/** Only the selected default-branch dispatch and its current protected job may mutate a PR. */
export async function verifyApproval(client: AutoChangesetGitHub, revision: AutoChangesetRevision, options: AutoChangesetApplyOptions) {
  const configuration = workflowConfiguration(options.approval)
  const env = options.env ?? process.env
  const frozenRun = revision.workflowRun
  if (!frozenRun || env['GITHUB_ACTIONS'] !== 'true' || env['GITHUB_EVENT_NAME'] !== 'workflow_dispatch'
    || env['GITHUB_REPOSITORY'] !== revision.repository || env['GITHUB_REF'] !== `refs/heads/${revision.defaultBranch}`
    || env['GITHUB_WORKFLOW_REF'] !== `${revision.repository}/${configuration.workflowPath}@refs/heads/${revision.defaultBranch}`
    || env['GITHUB_WORKFLOW_SHA'] !== revision.policySha || !env['GITHUB_EVENT_PATH']
    || Number(env['GITHUB_RUN_ID']) !== frozenRun.id || Number(env['GITHUB_RUN_ATTEMPT']) !== frozenRun.attempt) {
    throw new Error('Auto changeset application requires its trusted default-branch workflow_dispatch and frozen plan from the same attempt.')
  }
  const event = record(JSON.parse(await readFile(env['GITHUB_EVENT_PATH'], 'utf8')), 'workflow dispatch event')
  const eventRepository = record(event['repository'])
  if (eventRepository['id'] !== revision.repositoryId || eventRepository['full_name'] !== revision.repository
    || Number(record(event['inputs'])['pullRequest']) !== revision.pullRequest) {
    throw new Error('Workflow dispatch does not identify the frozen repository and pull request.')
  }
  const run = record(await client.json(`/actions/runs/${frozenRun.id}/attempts/${frozenRun.attempt}`))
  if (run['id'] !== frozenRun.id || run['run_attempt'] !== frozenRun.attempt || run['event'] !== 'workflow_dispatch'
    || run['path'] !== configuration.workflowPath || run['head_branch'] !== revision.defaultBranch
    || run['head_sha'] !== revision.policySha || record(run['repository'])['id'] !== revision.repositoryId) {
    throw new Error('Workflow run identity does not match the frozen default-branch application.')
  }
  const tree = await readTree(client, revision.policySha)
  const entry = tree.entries.get(configuration.workflowPath)
  if (!entry) {
    throw new Error('Approved workflow is missing from the trusted default-branch commit.')
  }
  const workflow = record(YAML.parse(await readBlob(client, entry)), 'trusted workflow')
  const jobs = Object.entries(record(workflow['jobs'], 'trusted workflow jobs')).map(([id, value]) => ({ id, value: record(value) }))
  const matching = jobs.filter(job => job.value['name'] === configuration.applyJobName)
  const selected = matching[0]?.value
  const environment = selected?.['environment']
  if (matching.length !== 1 || env['GITHUB_JOB'] !== matching[0]?.id
    || (typeof environment === 'string' ? environment : record(environment)['name']) !== configuration.environment) {
    throw new Error('The trusted apply job must use the selected protected environment literally.')
  }
  const protection = record(await client.json(`/environments/${encodeURIComponent(configuration.environment)}`))
  const rules = protection['protection_rules']
  if (protection['name'] !== configuration.environment || protection['can_admins_bypass'] !== false || !Array.isArray(rules)
    || !rules.some(value => record(value)['type'] === 'required_reviewers'
      && Array.isArray(record(value)['reviewers']) && (record(value)['reviewers'] as unknown[]).length > 0)) {
    throw new Error('Auto changeset application requires reviewer protection without administrator bypass.')
  }
  const environmentId = positive(protection['id'], 'protected environment ID')
  const approvals = await client.list(`/actions/runs/${frozenRun.id}/approvals`)
  if (!approvals.some(approval => approval['state'] === 'approved' && Array.isArray(approval['environments'])
    && (approval['environments'] as unknown[]).some(value => record(value)['id'] === environmentId && record(value)['name'] === configuration.environment))) {
    throw new Error('No approval exists for the selected protected environment.')
  }
  const executions = await client.list(`/actions/runs/${frozenRun.id}/attempts/${frozenRun.attempt}/jobs`, 'jobs')
  function job(name: string) {
    const candidates = executions.filter(value => value['name'] === name)
    const result = candidates[0]
    if (candidates.length !== 1 || !result || result['run_id'] !== frozenRun!.id || result['run_attempt'] !== frozenRun!.attempt) {
      throw new Error('Planning and application must both belong to the current workflow attempt; re-run all jobs.')
    }
    return result
  }
  const plan = job(configuration.planJobName)
  const apply = job(configuration.applyJobName)
  if (plan['status'] !== 'completed' || plan['conclusion'] !== 'success' || apply['status'] !== 'in_progress'
    || timestamp(plan['started_at']) > timestamp(plan['completed_at'])
    || timestamp(plan['completed_at']) > timestamp(apply['started_at'])) {
    throw new Error('A successful current-attempt plan must precede the protected application job.')
  }
}
