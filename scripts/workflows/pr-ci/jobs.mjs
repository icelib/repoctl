import assert from 'node:assert/strict'
import { assertPinnedActions, getSteps, githubExpression } from '../shared.mjs'

function needs(job) {
  return Array.isArray(job.needs) ? job.needs : job.needs ? [job.needs] : []
}

function dependsOnApproval(jobs, name, visited = new Set()) {
  if (name === 'approve') {
    return true
  }
  assert.ok(jobs[name], `Unknown dependency: ${name}`)
  assert.ok(!visited.has(name), 'PR workflow dependencies must not contain cycles')
  return needs(jobs[name]).some(dependency => dependsOnApproval(jobs, dependency, new Set([...visited, name])))
}

export function checkApproval(workflow, manual) {
  const jobs = workflow.jobs
  assert.ok(jobs.approve, 'A PR run must begin with one approval job')
  const environment = jobs.approve.environment
  assert.equal(typeof environment === 'string' ? environment : environment?.name, 'pr-ci')
  assert.deepEqual(needs(jobs.approve), [])
  const condition = jobs.approve.if
  assert.ok(condition?.includes(manual ? 'github.event.repository.default_branch' : 'github.event_name == \'pull_request\''))
  if (!manual) {
    assert.ok(condition.includes('github.event.pull_request.state == \'open\''), 'Closed PRs must only cancel the previous run')
    assert.ok(condition.includes('!github.event.pull_request.draft'), 'Draft PRs must not request approval')
  }
  for (const [name, job] of Object.entries(jobs)) {
    assert.ok(!job.if?.includes('always()'), 'Cancelled PR runs must not start more jobs')
    if (!manual) {
      assert.notEqual(job.permissions, 'write-all')
      assert.ok(!Object.values(job.permissions ?? {}).includes('write'), 'Native PR jobs must never request write credentials')
    }
    if (name !== 'approve') {
      assert.ok(dependsOnApproval(jobs, name), `${name} must depend on the approval gate`)
      assert.equal(job.environment, undefined, 'One approval must release the complete PR validation')
    }
    if (job.steps) {
      assertPinnedActions(job.steps, name)
    }
  }
}

export function checkOrchestration(workflow, manual) {
  const { jobs } = workflow
  assert.deepEqual(needs(jobs.prepare), ['approve'])
  const permissions = { 'contents': 'read', 'pull-requests': 'read', ...(manual ? { statuses: 'write' } : {}) }
  assert.deepEqual(jobs.prepare.permissions, permissions)
  assert.deepEqual(jobs.report.permissions, permissions)
  for (const output of ['head_sha', 'base_sha', 'base_ref', 'merge_sha', 'head_ref', 'head_repository', 'release_labels', 'run_ci', 'run_devcontainer', 'pr_number']) {
    assert.equal(jobs.prepare.outputs?.[output], githubExpression(`steps.prepare.outputs.${output}`))
  }
  for (const name of ['prepare', 'report']) {
    const steps = getSteps(workflow, name)
    const checkout = steps.find(step => step.uses?.startsWith('actions/checkout@'))
    assert.equal(checkout?.with?.ref, githubExpression('github.sha'), 'Orchestration must run the immutable approved event revision')
    assert.equal(checkout?.with?.['persist-credentials'], false)
    assert.ok(!steps.some(step => step.uses?.startsWith('actions/create-github-app-token@')))
    const command = steps.find(step => step.run === `node .github/pr-ci/index.mjs ${name}${manual ? '-manual' : ''}`)
    assert.ok(command, `${name} must delegate to the trusted PR orchestrator`)
    assert.equal(command.env?.GITHUB_TOKEN, githubExpression('github.token'))
    assert.ok(!JSON.stringify(steps).includes('REPOCTL_APP_PRIVATE_KEY'))
  }
  if (!manual) {
    assert.ok(jobs.report.name.includes('PR Validation') && jobs.report.name.includes('Ignored PR event'), 'Ignored events must not publish a skipped required PR Validation check')
  }
  else {
    assert.equal(jobs.approve.outputs?.approval_attempt, githubExpression('steps.approval.outputs.attempt'))
    const approval = getSteps(workflow, 'approve').find(step => step.id === 'approval')
    assert.equal(approval?.env?.RUN_ATTEMPT, githubExpression('github.run_attempt'))
    const freshness = getSteps(workflow, 'prepare')[0]
    assert.equal(freshness.env?.APPROVAL_ATTEMPT, githubExpression('needs.approve.outputs.approval_attempt'))
    assert.equal(freshness.env?.RUN_ATTEMPT, githubExpression('github.run_attempt'))
    assert.match(freshness.run, /exit 1/u, 'Failed manual preparation must require approval for the current attempt')
  }
  const steps = getSteps(workflow, 'report')
  assert.equal(steps[0].if, githubExpression('needs.prepare.result != \'success\''))
  assert.match(steps[0].run, /exit 1/u, 'Preparation failure must fail the report before checkout')
  assert.equal(jobs.report.if, githubExpression('!cancelled() && needs.approve.result == \'success\''))
  assert.equal(jobs.report['timeout-minutes'], 5)
  assert.deepEqual([...needs(jobs.report)].sort(), ['approve', 'build', 'devcontainer', 'prepare', 'release-intent'])
  const report = getSteps(workflow, 'report').find(step => step.run === `node .github/pr-ci/index.mjs report${manual ? '-manual' : ''}`)
  for (const [key, output] of [['BASE_REF', 'base_ref'], ['HEAD_REF', 'head_ref'], ['HEAD_REPOSITORY', 'head_repository'], ['RELEASE_LABELS', 'release_labels']]) {
    assert.equal(report.env?.[key], githubExpression(`needs.prepare.outputs.${output}`))
  }
}

export function checkValidators(workflow, manual) {
  const { jobs } = workflow
  for (const [name, filename] of [['build', 'ci.yml'], ['devcontainer', 'devcontainer.yml'], ['release-intent', 'release-intent-check.yml']]) {
    const job = jobs[name]
    assert.ok(job, `${name} validation must be included`)
    assert.deepEqual(needs(job), name === 'release-intent' ? ['prepare'] : ['prepare', 'release-intent'], 'Release intent must pass before starting the complete heavy matrix')
    assert.equal(job.uses, `./.github/workflows/${filename}`)
    assert.equal(job.with?.ref, githubExpression('needs.prepare.outputs.merge_sha'))
    assert.deepEqual(job.permissions, { contents: 'read' })
    if (name === 'build') {
      const repository = manual ? 'needs.prepare.outputs.head_repository' : 'github.event.pull_request.head.repo.full_name'
      assert.deepEqual(job.secrets, {
        TURBO_TOKEN: githubExpression(`${repository} == github.repository && secrets.TURBO_TOKEN || ''`),
        CODECOV_TOKEN: githubExpression(`${repository} == github.repository && secrets.CODECOV_TOKEN || ''`),
      })
    }
    else {
      assert.equal(job.secrets, undefined, 'PR validation must not inherit repository secrets')
    }
  }
  assert.equal(jobs.build.if, githubExpression('needs.prepare.outputs.run_ci == \'true\''))
  assert.equal(jobs.devcontainer.if, githubExpression('needs.prepare.outputs.run_devcontainer == \'true\''))
  for (const input of ['base_sha', 'head_sha', 'head_ref']) {
    assert.equal(jobs['release-intent'].with?.[input], githubExpression(`needs.prepare.outputs.${input}`))
  }
}
