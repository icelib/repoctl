import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { assertPinnedActions, getSteps, githubExpression, readWorkflow } from './shared.mjs'

function needs(job) {
  return Array.isArray(job.needs) ? job.needs : job.needs ? [job.needs] : []
}

function dependsOnApproval(jobs, name, visited = new Set()) {
  if (name === 'approve') {
    return true
  }
  assert.ok(jobs[name], `Unknown dependency: ${name}`)
  assert.ok(!visited.has(name), 'PR workflow dependencies must not contain cycles')
  return needs(jobs[name]).some((dependency) => {
    return dependsOnApproval(jobs, dependency, new Set([...visited, name]))
  })
}

function checkPullRequestEntrypoints(rootDir) {
  const directory = path.join(rootDir, '.github', 'workflows')
  for (const filename of fs.readdirSync(directory).filter(name => /\.ya?ml$/u.test(name))) {
    const { workflow } = readWorkflow(rootDir, filename)
    assert.equal(workflow.on?.pull_request, undefined, `${filename} must not bypass PR approval`)
    if (filename !== 'pr-ci.yml') {
      assert.equal(workflow.on?.pull_request_target, undefined, `${filename} must not bypass PR approval`)
    }
  }
}

export function checkPrCiWorkflow(rootDir) {
  checkPullRequestEntrypoints(rootDir)
  const { workflow } = readWorkflow(rootDir, 'pr-ci.yml')
  assert.equal(workflow['run-name'], `PR checks for #${githubExpression('github.event.pull_request.number || inputs.pr_number')}`, 'Run names must retain the PR number after YAML parsing')
  assert.deepEqual(workflow.on?.pull_request_target?.types, [
    'opened',
    'synchronize',
    'reopened',
    'ready_for_review',
    'labeled',
    'unlabeled',
  ])
  assert.deepEqual(Object.keys(workflow.on ?? {}), ['pull_request_target', 'workflow_dispatch'])
  assert.equal(workflow.on?.workflow_dispatch?.inputs?.pr_number?.required, true)
  assert.deepEqual(workflow.permissions, { contents: 'read' })
  assert.equal(workflow.concurrency?.['cancel-in-progress'], true)
  assert.ok(workflow.concurrency?.group?.includes('pull_request.number'), 'Concurrency must isolate each PR')
  assert.ok(workflow.concurrency?.group?.includes('inputs.pr_number'), 'Manual dispatches must share the PR cancellation group')
  assert.equal(workflow.concurrency?.queue, undefined, 'PRs may validate in parallel')

  const jobs = workflow.jobs
  assert.ok(jobs.approve, 'A PR run must begin with one approval job')
  const environment = jobs.approve.environment
  assert.equal(typeof environment === 'string' ? environment : environment?.name, 'pr-ci')
  assert.deepEqual(needs(jobs.approve), [])
  assert.equal(jobs.approve.if, githubExpression('(github.event_name == \'workflow_dispatch\' && github.ref == format(\'refs/heads/{0}\', github.event.repository.default_branch)) || (github.event_name == \'pull_request_target\' && !github.event.pull_request.draft)'), 'Only ready PRs and default-branch dispatches may request approval')
  for (const [name, job] of Object.entries(jobs)) {
    if (name !== 'approve') {
      assert.ok(dependsOnApproval(jobs, name), `${name} must depend on the approval gate`)
      assert.equal(job.environment, undefined, 'One approval must release the complete PR validation')
    }
    if (job.steps) {
      assertPinnedActions(job.steps, name)
    }
  }

  assert.deepEqual(needs(jobs.prepare), ['approve'])
  assert.deepEqual(jobs.prepare.permissions, { 'contents': 'write', 'pull-requests': 'write', 'statuses': 'write' })
  assert.deepEqual(jobs.report.permissions, { 'contents': 'read', 'pull-requests': 'read', 'statuses': 'write' })
  for (const output of ['head_sha', 'base_sha', 'merge_sha', 'head_ref', 'run_ci', 'run_devcontainer', 'pr_number']) {
    assert.equal(jobs.prepare.outputs?.[output], githubExpression(`steps.prepare.outputs.${output}`))
  }

  for (const name of ['prepare', 'report']) {
    const steps = getSteps(workflow, name)
    const checkout = steps.find(step => step.uses?.startsWith('actions/checkout@'))
    assert.equal(checkout?.with?.ref, githubExpression('github.event_name == \'workflow_dispatch\' && github.event.repository.default_branch || github.sha'), 'Write-capable jobs must check out trusted base workflow code')
    assert.equal(checkout?.with?.['persist-credentials'], false)
    assert.ok(!steps.some(step => step.uses?.startsWith('actions/create-github-app-token@')), 'Automatic changesets must not trigger another PR run through App credentials')
    const command = steps.find(step => step.run === `node .github/pr-ci/index.mjs ${name}`)
    assert.ok(command, `${name} must delegate to the trusted PR orchestrator`)
    assert.equal(command.env?.GITHUB_TOKEN, githubExpression('github.token'))
  }

  for (const [name, filename] of [
    ['build', 'ci.yml'],
    ['devcontainer', 'devcontainer.yml'],
    ['release-intent', 'release-intent-check.yml'],
  ]) {
    const job = jobs[name]
    assert.ok(job, `${name} validation must be included`)
    assert.ok(needs(job).includes('prepare'))
    assert.equal(job.uses, `./.github/workflows/${filename}`)
    assert.equal(job.with?.ref, githubExpression('needs.prepare.outputs.merge_sha'))
    assert.deepEqual(job.permissions, { contents: 'read' })
    if (name === 'build') {
      assert.deepEqual(job.secrets, {
        TURBO_TOKEN: githubExpression('github.event.pull_request.head.repo.full_name == github.repository && secrets.TURBO_TOKEN || \'\''),
        CODECOV_TOKEN: githubExpression('github.event.pull_request.head.repo.full_name == github.repository && secrets.CODECOV_TOKEN || \'\''),
      }, 'Only explicit cache and coverage secrets may reach approved same-repository CI')
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
  assert.ok(jobs.report.if?.includes('always()'), 'Validation failures must publish a terminal commit status')
  assert.ok(jobs.report.if?.includes('needs.prepare.result == \'success\''), 'Reports require the prepared final revision')
  assert.ok(needs(jobs.report).includes('build'))
  assert.ok(needs(jobs.report).includes('devcontainer'))
  assert.ok(needs(jobs.report).includes('release-intent'))
}
