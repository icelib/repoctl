import assert from 'node:assert/strict'
import { assertPinnedActions, assertReusableValidation, checkAppAuthentication, getSteps, githubExpression, readWorkflow } from './shared.mjs'

export function checkReleaseIntentWorkflow(rootDir) {
  const { source, workflow } = readWorkflow(rootDir, 'release-intent-check.yml')
  const job = workflow.jobs?.['release-intent']

  assertReusableValidation(workflow, ['ref', 'base_sha', 'head_sha', 'head_ref'])
  assert.ok(job, 'release intent workflow must define release-intent job')
  assert.equal(job.if, undefined, 'Draft filtering belongs to the approval entrypoint')
  assert.ok(source.includes('inputs.base_sha'))
  assert.ok(source.includes('inputs.head_sha'))
  assert.ok(source.includes('inputs.head_ref'))
  assert.ok(!source.includes('github.event.pull_request'), 'Reusable checks must use the approved revision inputs')
  assert.match(source, /rg '\^packages\/\[\^\/\]\+\/'/)
  assert.match(source, /rg -v '\/dist\/'/)
  assert.doesNotMatch(source, /apps\/mock/)
  assert.match(source, /\.changeset\/\.\+\\\.md/)
}

export function checkAutomaticReleaseIntentWorkflow(rootDir) {
  const { source, workflow } = readWorkflow(rootDir, 'release-intent-auto.yml')
  const job = workflow.jobs?.generate
  const steps = getSteps(workflow, 'generate')

  assert.deepEqual(Object.keys(workflow.on ?? {}), ['workflow_dispatch'], 'Changeset backfills require an explicit dispatch')
  assert.ok(workflow.on?.workflow_dispatch?.inputs?.pr_numbers)
  assert.equal(workflow.permissions?.contents, 'write')
  assert.equal(workflow.permissions?.['pull-requests'], 'write')
  assert.ok(job)
  assert.ok(steps.some(step => step.run === 'node .github/auto-changeset/index.mjs'))
  const checkout = steps.find(step => step.uses?.startsWith('actions/checkout@'))
  assert.equal(checkout?.with?.ref, githubExpression('github.event.pull_request.base.sha || github.sha'))
  assert.equal(checkout?.with?.['persist-credentials'], false)
  const trustedWrite = 'github.event_name == \'workflow_dispatch\' || github.event.pull_request.head.repo.full_name == github.repository'
  checkAppAuthentication(steps, `vars.REPOCTL_APP_CLIENT_ID != '' && (${trustedWrite})`)
  assert.equal(steps.find(step => step.name === 'Validate GitHub App configuration').if, githubExpression(trustedWrite))
  assert.equal(steps.find(step => step.run === 'node .github/auto-changeset/index.mjs').env?.GITHUB_TOKEN, githubExpression('steps.app-token.outputs.token || github.token'))
  assert.match(source, /GITHUB_TOKEN:/)
  assert.match(source, /PR_NUMBERS:/)
  assertPinnedActions(steps, 'Automatic Release Intent')
}
