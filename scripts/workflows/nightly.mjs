import assert from 'node:assert/strict'
import { assertPinnedActions, getSteps, githubExpression } from './shared.mjs'

export function checkNightlyWorkflow(workflow, { schedule = '17 19 * * *', provider = 'npm' } = {}) {
  assert.deepEqual(workflow.on?.schedule, schedule ? [{ cron: schedule }] : undefined)
  const nightly = workflow.jobs?.nightly
  assert.ok(nightly, 'The managed release workflow must expose manual nightly publication')
  const manual = 'github.event_name == \'workflow_dispatch\' && inputs.mode == \'nightly\''
  assert.equal(nightly.if, githubExpression(schedule ? `(github.event_name == 'schedule' && github.event.schedule == '${schedule}') || (${manual})` : manual))
  assert.deepEqual(nightly.env, { REPOCTL_NIGHTLY_PROVIDER: provider, REPOCTL_NIGHTLY_SCHEDULE: schedule ?? '' })
  assert.deepEqual(nightly.permissions, provider === 'npm' ? { 'contents': 'read', 'id-token': 'write' } : { contents: 'read' })
  assert.equal(nightly['timeout-minutes'], 90)
  const steps = getSteps(workflow, 'nightly')
  assertPinnedActions(steps, 'Nightly')
  const guard = steps[0]
  assert.equal(guard.env.DEFAULT_BRANCH, githubExpression('github.event.repository.default_branch'))
  assert.ok(guard.run.includes('"$GITHUB_REF" != "refs/heads/$DEFAULT_BRANCH"'))
  assert.ok(guard.run.includes('[ -z "$DEFAULT_BRANCH" ]'))
  const checkout = steps.find(step => step.uses?.startsWith('actions/checkout@'))
  assert.equal(checkout.id, 'nightly-checkout')
  assert.equal(checkout.with?.ref, githubExpression('github.sha'))
  assert.equal(checkout.with?.['persist-credentials'], false)
  const node = steps.find(step => step.uses?.startsWith('actions/setup-node@'))
  assert.equal(node.with?.['node-version'], '24.22.1')
  assert.equal(node.with?.['registry-url'], undefined)
  assert.ok(steps.some(step => step.run === 'pnpm install --frozen-lockfile --ignore-scripts'))
  const publish = steps.find(step => step.id === 'nightly-publish')
  // eslint-disable-next-line no-template-curly-in-string -- Match Bash array expansion literally.
  assert.ok(publish.run.includes('pnpm exec repo release nightly "${args[@]}"'))
  assert.equal(publish.env.REPOCTL_SNAPSHOT_PUBLISH, '1')
  for (const [name, input] of Object.entries({ REPO_RELEASE_PACKAGE: 'package', REPO_RELEASE_VERSION: 'version', REPO_RELEASE_DRY_RUN: 'dry-run', REPO_RELEASE_RECOVERY_SOURCE_SHA: 'source-sha' })) {
    assert.equal(publish.env[name], githubExpression(`inputs.${input}`))
  }
  assert.ok(publish.run.includes('args=(--publish --output "$RUNNER_TEMP/repoctl-nightly" --json)'))
  assert.ok(publish.run.includes('args+=(--dry-run)'))
  assert.ok(!publish.run.includes('--stage'))
  assert.notEqual(publish['continue-on-error'], true)
  const artifact = steps.find(step => step.uses?.startsWith('actions/upload-artifact@'))
  assert.equal(artifact.if, githubExpression('always()'))
  assert.equal(artifact.with?.['retention-days'], 14)
  assert.equal(artifact.with?.path, [
    `${githubExpression('runner.temp')}/repoctl-nightly/*.json`,
    `${githubExpression('runner.temp')}/repoctl-nightly/**/nightly-report.json`,
    `${githubExpression('runner.temp')}/repoctl-nightly/**/consumer-report.json`,
    `${githubExpression('runner.temp')}/repoctl-nightly/**/snapshot-report.json`,
    `${githubExpression('runner.temp')}/repoctl-nightly/**/tarballs/**/*.tgz`,
    '',
  ].join('\n'))
  for (const forbidden of ['create-github-app-token', 'NPM_TOKEN', 'NODE_AUTH_TOKEN', 'GITHUB_TOKEN', 'git reset', 'git clean', '.github/nightly/']) {
    assert.ok(!JSON.stringify(nightly).includes(forbidden), `Nightly must not use ${forbidden}`)
  }
}
