import assert from 'node:assert/strict'
import { assertPinnedActions, checkAppAuthentication, getSteps, githubExpression, readWorkflow } from './shared.mjs'

export function checkReleaseWorkflow(rootDir) {
  const { source, workflow } = readWorkflow(rootDir, 'release.yml')
  const release = workflow.jobs?.release
  const steps = getSteps(workflow, 'release')
  const checkout = steps.find(step =>
    step.uses?.startsWith('actions/checkout@'),
  )
  const runner = steps.find(step => step.run === 'pnpm exec repo release ci --stage plan')
  assert.deepEqual(steps.filter(step => step.run?.startsWith('pnpm exec repo release ci')).map(step => step.id), ['plan', 'verify', 'prepare', 'upload', 'confirm', 'finalize'].map(stage => `release-${stage}`))
  assert.equal(steps.find(step => step.uses?.startsWith('actions/setup-node@'))?.with?.['registry-url'], undefined)
  assert.ok(!source.includes('NODE_AUTH_TOKEN'))
  const branches = workflow.on?.push?.branches ?? []
  const modes = workflow.on?.workflow_dispatch?.inputs?.mode?.options ?? []

  assert.ok(source.startsWith('# repoctl-managed: release/v2\n'))
  assert.deepEqual(branches, ['main', 'alpha', 'beta', 'rc', 'next'])
  assert.deepEqual(modes, ['auto', 'prepare', 'publish', 'publish-unpublished', 'reconcile', 'oidc-audit'])
  assert.equal(release.if, githubExpression('inputs.mode != \'oidc-audit\''))
  const audit = workflow.jobs?.['oidc-audit']
  assert.equal(audit?.if, githubExpression('github.event_name == \'workflow_dispatch\' && inputs.mode == \'oidc-audit\''))
  assert.deepEqual(audit?.permissions, { 'contents': 'read', 'id-token': 'write' })
  const auditSteps = getSteps(workflow, 'oidc-audit')
  assert.equal(auditSteps.find(step => step.uses?.startsWith('actions/checkout@'))?.with?.['persist-credentials'], false)
  assert.ok(auditSteps.some(step => step.run === 'pnpm install --frozen-lockfile --ignore-scripts'))
  assert.ok(auditSteps.some(step => step.run === 'pnpm exec repo release ci --mode oidc-audit'))
  assertPinnedActions(auditSteps, 'OIDC audit')
  assert.equal(workflow.permissions?.contents, 'write')
  assert.equal(workflow.permissions?.['pull-requests'], 'write')
  assert.equal(workflow.permissions?.['id-token'], 'write')
  assert.equal(workflow.permissions?.actions, 'write', 'Release PRs created with the event token must request an approval-gated workflow dispatch')
  assert.equal(
    workflow.concurrency?.group,
    `${githubExpression('github.workflow')}-${githubExpression('github.ref')}`,
  )
  assert.equal(workflow.concurrency?.['cancel-in-progress'], false)
  assert.equal(workflow.env?.NPM_CONFIG_PROVENANCE, true)
  assert.equal(checkout?.with?.['fetch-depth'], 0)
  assert.ok(release)
  assert.ok(runner, 'release job must delegate to repo release ci')
  assert.equal(
    runner.env?.GITHUB_TOKEN,
    githubExpression(
      'steps.app-token.outputs.token || secrets.REPOCTL_RELEASE_TOKEN || secrets.CHANGESETS_RELEASE_TOKEN || github.token',
    ),
  )
  assert.equal(checkout?.with?.token, runner.env?.GITHUB_TOKEN, 'Git pushes and API calls must use the same credential')
  assert.notEqual(checkout?.with?.['persist-credentials'], false)
  checkAppAuthentication(steps, 'vars.REPOCTL_APP_CLIENT_ID != \'\'')
  assert.ok(steps.findIndex(step => step.id === 'app-token') < steps.indexOf(checkout))
  assert.equal(
    runner.env?.REPO_RELEASE_MODE,
    githubExpression('inputs.mode || \'auto\''),
  )
  const approval = steps.find(step => step.id === 'pr-ci-approval')
  assert.ok(approval, 'Release must request approval for event-token-created Release PRs')
  assert.equal(steps.filter(step => step.id === 'pr-ci-approval').length, 1)
  assert.equal(steps.filter(step => step.run === 'node .github/pr-ci/index.mjs release').length, 1)
  assert.equal(approval.name, 'Request Release PR approval')
  assert.equal(approval.run, 'node .github/pr-ci/index.mjs release')
  assert.equal(approval.if, githubExpression('steps.release-prepare.outcome == \'success\''), 'Credential checks belong in env because step conditions cannot access secrets')
  assert.deepEqual(approval.env, {
    GITHUB_TOKEN: githubExpression('github.token'),
    RELEASE_USES_EVENT_TOKEN: githubExpression('steps.app-token.outputs.token == \'\' && secrets.REPOCTL_RELEASE_TOKEN == \'\' && secrets.CHANGESETS_RELEASE_TOKEN == \'\''),
    DEFAULT_BRANCH: githubExpression('github.event.repository.default_branch'),
  })
  assert.ok(steps.findIndex(step => step.id === 'release-prepare') < steps.indexOf(approval))
  assert.ok(steps.indexOf(approval) < steps.findIndex(step => step.id === 'release-upload'))
  assert.notEqual(approval['continue-on-error'], true)
  const artifact = steps.find(step => step.uses?.startsWith('actions/upload-artifact@'))
  assert.ok(artifact, 'release workflow must preserve publish diagnostics')
  assert.equal(artifact.if, githubExpression('always()'))
  assert.equal(artifact.with?.name, `npm-publish-progress-${githubExpression('github.run_id')}-${githubExpression('github.run_attempt')}`)
  assert.equal(artifact.with?.path, 'pnpm-publish-summary.json\nrepoctl-publish-progress.json\nrepoctl-release-progress.json\nrepoctl-ci-progress.json\n')
  assert.equal(artifact.with?.['if-no-files-found'], 'ignore')
  assert.equal(artifact.with?.['retention-days'], 14)
  assert.notEqual(runner['continue-on-error'], true)
  assertPinnedActions(steps, 'Release')

  for (const legacyEntry of [
    'changesets/action',
    'changeset publish',
    '.changeset/pre.json',
    'peter-evans/create-pull-request',
  ]) {
    assert.ok(
      !source.includes(legacyEntry),
      `release workflow contains legacy entry: ${legacyEntry}`,
    )
  }
}
