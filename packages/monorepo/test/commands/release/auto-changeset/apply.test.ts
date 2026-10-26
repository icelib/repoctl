import type { FixtureOptions } from './fixture'
import { Buffer } from 'node:buffer'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { applyAutoChangeset, createAutoChangesetPlan } from '@icebreakers/monorepo'
import { afterEach, describe, expect, it } from 'vitest'
import { baseSha, commitSha, githubFixture, headSha, policySha, repository, workflowPath, workspaceFiles } from './fixture'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function approvedFixture(options?: FixtureOptions) {
  const fixture = githubFixture(options)
  const directory = await mkdtemp(path.join(os.tmpdir(), 'repoctl-auto-approval-test-'))
  directories.push(directory)
  const eventPath = path.join(directory, 'event.json')
  await writeFile(eventPath, JSON.stringify({ repository: { id: 1, full_name: repository }, inputs: { pullRequest: '17' } }))
  fixture.api.env = {
    GITHUB_ACTIONS: 'true',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REPOSITORY: repository,
    GITHUB_REF: 'refs/heads/main',
    GITHUB_WORKFLOW_REF: `${repository}/${workflowPath}@refs/heads/main`,
    GITHUB_WORKFLOW_SHA: policySha,
    GITHUB_RUN_ID: '91',
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_JOB: 'apply',
    GITHUB_EVENT_PATH: eventPath,
  }
  return fixture
}

describe('approved automatic changeset application', () => {
  it('atomically appends one commit to the exact frozen head after checking the current approval attempt', async () => {
    const fixture = await approvedFixture()
    const plan = await createAutoChangesetPlan(fixture.api)
    const report = await applyAutoChangeset({ ...fixture.api, expected: plan.revision })
    expect(report.status).toBe('applied')
    expect(report.commitSha).toBe(commitSha)
    expect(fixture.mutations).toHaveLength(1)
    expect(fixture.mutations[0]).toMatchObject({ path: '/graphql', body: {
      variables: { input: { expectedHeadOid: headSha, branch: { repositoryNameWithOwner: repository, branchName: 'fix/runtime' }, fileChanges: { additions: [{ path: '.changeset/auto-pr-17.md', contents: Buffer.from(plan.change!.content!).toString('base64') }] } } },
    } })
    expect(fixture.state.branchHead).toBe(commitSha)
  })

  it.each(['title', 'labels', 'head', 'base', 'policy'])('rejects a stale frozen %s before any mutation', async (field) => {
    const fixture = await approvedFixture()
    const plan = await createAutoChangesetPlan(fixture.api)
    if (field === 'title') {
      fixture.pull['title'] = 'feat: a different proposal'
    }
    else if (field === 'labels') {
      fixture.labels.push('release:minor')
    }
    else if (field === 'policy') {
      fixture.api.policy = { defaultLevel: 'major' }
    }
    else {
      (fixture.pull[field] as Record<string, unknown>)['sha'] = 'f'.repeat(40)
    }
    await expect(applyAutoChangeset({ ...fixture.api, expected: plan.revision })).rejects.toThrow('stale')
    expect(fixture.mutations).toEqual([])
  })

  it('rejects unapproved local application and missing protected reviewers', async () => {
    const local = githubFixture()
    const localPlan = await createAutoChangesetPlan(local.api)
    await expect(applyAutoChangeset({ ...local.api, expected: localPlan.revision })).rejects.toThrow('trusted default-branch')
    expect(local.mutations).toEqual([])
    const fixture = await approvedFixture()
    const plan = await createAutoChangesetPlan(fixture.api)
    fixture.overrides.set('/environments/release-intent-write', { name: 'release-intent-write', can_admins_bypass: true, protection_rules: [] })
    await expect(applyAutoChangeset({ ...fixture.api, expected: plan.revision })).rejects.toThrow('reviewer protection')
    expect(fixture.mutations).toEqual([])
  })

  it('requires successful planning in the current attempt, not a previous approval or job', async () => {
    const fixture = await approvedFixture()
    const plan = await createAutoChangesetPlan(fixture.api)
    fixture.overrides.set('/actions/runs/91/attempts/1/jobs?per_page=100&page=1', { total_count: 2, jobs: [
      { name: 'Plan automatic changeset', run_id: 91, run_attempt: 0, status: 'completed', conclusion: 'success' },
      { name: 'Apply automatic changeset', run_id: 91, run_attempt: 1, status: 'in_progress' },
    ] })
    await expect(applyAutoChangeset({ ...fixture.api, expected: plan.revision })).rejects.toThrow('current workflow attempt')
    expect(fixture.mutations).toEqual([])
  })

  it('rechecks the revision immediately before updating a ref', async () => {
    const fixture = await approvedFixture()
    const plan = await createAutoChangesetPlan(fixture.api)
    let reads = 0
    fixture.overrides.set('/pulls/17', () => {
      if (++reads === 3) {
        return { ...fixture.pull, title: 'fix: changed while preparing the commit' }
      }
      return fixture.pull
    })
    await expect(applyAutoChangeset({ ...fixture.api, expected: plan.revision })).rejects.toThrow('stale')
    expect(fixture.mutations).toEqual([])
  })

  it('does not resurrect withdrawn commits when the branch is reset to an ancestor after the last read', async () => {
    const fixture = await approvedFixture()
    const plan = await createAutoChangesetPlan(fixture.api)
    fixture.state.beforeMutation = () => {
      fixture.state.branchHead = baseSha
    }
    await expect(applyAutoChangeset({ ...fixture.api, expected: plan.revision })).rejects.toThrow('conditional automatic changeset commit')
    expect(fixture.state.branchHead).toBe(baseSha)
    expect(fixture.mutations).toHaveLength(1)
    expect(fixture.mutations[0]).toMatchObject({ path: '/graphql', body: { variables: { input: { expectedHeadOid: headSha } } } })
  })

  it('deletes a withdrawn managed intent through the same atomic commit API', async () => {
    const initial = await createAutoChangesetPlan(githubFixture().api)
    const fixture = await approvedFixture({ head: { ...workspaceFiles(), '.changeset/auto-pr-17.md': initial.change!.content! }, files: [{ filename: '.changeset/auto-pr-17.md', status: 'added' }] })
    const plan = await createAutoChangesetPlan(fixture.api)
    expect(plan.change?.action).toBe('delete')
    expect((await applyAutoChangeset({ ...fixture.api, expected: plan.revision })).status).toBe('applied')
    expect(fixture.mutations[0]).toMatchObject({ path: '/graphql', body: { variables: { input: { expectedHeadOid: headSha, fileChanges: { deletions: [{ path: '.changeset/auto-pr-17.md' }] } } } } })
  })

  it('keeps forks mutation-free even when apply is requested', async () => {
    const fixture = githubFixture({ fork: true })
    const plan = await createAutoChangesetPlan(fixture.api)
    expect((await applyAutoChangeset({ ...fixture.api, expected: plan.revision })).status).toBe('fork')
    expect(fixture.mutations).toEqual([])
  })
})
