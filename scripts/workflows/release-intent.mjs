import assert from 'node:assert/strict'
import { assertPinnedActions, assertReusableValidation, checkAppAuthentication, getSteps, githubExpression, readWorkflow } from './shared.mjs'

export function checkReleaseIntentWorkflow(rootDir) {
  const { source, workflow } = readWorkflow(rootDir, 'release-intent-check.yml')
  const job = workflow.jobs?.['release-intent']

  assertReusableValidation(workflow, ['ref', 'base_sha', 'base_ref', 'head_sha', 'head_ref'])
  assert.ok(job, 'release intent workflow must define release-intent job')
  assert.equal(job.if, undefined, 'Draft filtering belongs to the approval entrypoint')
  assert.ok(source.includes('inputs.base_sha'))
  assert.ok(source.includes('inputs.head_sha'))
  assert.ok(source.includes('inputs.head_ref'))
  assert.ok(!source.includes('github.event.pull_request'), 'Reusable checks must use the approved revision inputs')
  assert.doesNotMatch(source, /apps\/mock/)
  assert.doesNotMatch(source, /skipping validation/u, 'A release branch name must never grant an exemption by itself')
  const steps = getSteps(workflow, 'release-intent')
  const presence = steps.find(step => step.name === 'Validate release intent presence')
  assert.ok(presence)
  assert.equal(presence.env?.BASE_SHA, githubExpression('inputs.base_sha'))
  assert.equal(presence.env?.HEAD_SHA, githubExpression('inputs.head_sha'))
  assert.match(presence.run, /if ! git diff --name-status --no-renames -z/u, 'Git failures must stop validation and paths must remain NUL-delimited')
  assert.match(presence.run, /packages\/\*\/\*/u)
  assert.match(presence.run, /\*\/dist\/\*/u)
  assert.match(presence.run, /\[AM\]:\.changeset\/\?\*\.md/u, 'Only added or modified intents may satisfy admission')
  assert.doesNotMatch(presence.run, /\brg\b|\|\| true/u, 'Missing optional tools must never masquerade as an empty diff')
  const validator = steps.find(step => step.run?.includes('release validate-preparation'))
  assert.ok(validator, 'Release-like PRs require native version-preparation validation')
  assert.equal(validator.env?.BASE_SHA, githubExpression('inputs.base_sha'))
  assert.equal(validator.env?.HEAD_SHA, githubExpression('inputs.head_sha'))
  assert.equal(validator.env?.BASE_REF, githubExpression('inputs.base_ref'))
  assert.equal(validator['continue-on-error'], undefined, 'Invalid preparation must fail admission')
  const trusted = steps.find(step => step.with?.path === 'release-validation-tools')
  assert.equal(trusted?.with?.ref, githubExpression('inputs.base_sha'))
  assert.equal(trusted?.with?.['persist-credentials'], false)
  const build = steps.find(step => step.run?.includes('pnpm --filter repoctl... build'))
  assert.equal(build?.['working-directory'], 'release-validation-tools')
  assert.match(build?.run ?? '', /pnpm install --frozen-lockfile --ignore-scripts/u)
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
