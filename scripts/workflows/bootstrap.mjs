import assert from 'node:assert/strict'
import { assertPinnedActions, getSteps, githubExpression } from './shared.mjs'

export function checkBootstrapWorkflow(workflow) {
  const inputs = workflow.on?.workflow_dispatch?.inputs
  assert.equal(inputs?.tag?.default, 'alpha')
  assert.equal(inputs?.['verify-run-id']?.type, 'string')
  const prepare = workflow.jobs?.['bootstrap-prepare']
  const publish = workflow.jobs?.['bootstrap-publish']
  const verify = workflow.jobs?.['bootstrap-verify']
  assert.equal(prepare?.name, 'Prepare bootstrap package')
  assert.equal(publish?.name, 'Publish bootstrap package')
  assert.deepEqual(prepare?.permissions, { contents: 'read' })
  assert.deepEqual(publish?.permissions, { 'contents': 'read', 'actions': 'read', 'id-token': 'write' })
  assert.deepEqual(verify?.permissions, { contents: 'read', actions: 'read' })
  assert.equal(publish.needs, 'bootstrap-prepare')
  assert.deepEqual(verify.needs, ['bootstrap-prepare', 'bootstrap-publish'])
  assert.ok(prepare.if.includes('inputs.verify-run-id == \'\''))
  assert.ok(publish.if.includes('inputs.verify-run-id == \'\''))
  assert.ok(publish.if.includes('!inputs.dry-run'))
  assert.ok(verify.if.includes('inputs.verify-run-id != \'\''))
  const prepareSteps = getSteps(workflow, 'bootstrap-prepare')
  const checkout = prepareSteps.find(step => step.uses?.startsWith('actions/checkout@'))
  assert.equal(checkout?.with?.ref, githubExpression('github.sha'))
  assert.equal(checkout?.with?.['persist-credentials'], false)
  const artifact = prepareSteps.find(step => step.uses?.startsWith('actions/upload-artifact@'))
  assert.equal(artifact?.with?.name, `repoctl-bootstrap-${githubExpression('github.run_id')}-${githubExpression('github.run_attempt')}`)
  assert.equal(artifact?.with?.path, `${githubExpression('runner.temp')}/repoctl-bootstrap/bootstrap-manifest.json\n${githubExpression('runner.temp')}/repoctl-bootstrap/tarballs/\n`)
  for (const name of ['bootstrap-prepare', 'bootstrap-publish', 'bootstrap-verify']) {
    assertPinnedActions(getSteps(workflow, name), name)
  }
  for (const name of ['bootstrap-publish', 'bootstrap-verify']) {
    const job = workflow.jobs[name]
    assert.match(job.env.REPOCTL_BOOTSTRAP_TOOL_VERSION, /^\d+\.\d+\.\d+(?:-[\dA-Z.-]+)?$/i)
    const steps = getSteps(workflow, name)
    assert.ok(!steps.some(step => step.uses?.startsWith('actions/checkout@')))
    const install = steps.find(step => step.id === 'bootstrap-tool')
    assert.ok(install.run.includes('"repoctl@$REPOCTL_BOOTSTRAP_TOOL_VERSION"'))
    assert.ok(install.run.includes('--ignore-scripts'))
    assert.ok(install.run.includes('--registry=https://registry.npmjs.org'))
    for (const forbidden of ['pnpm ', 'tooling:build', 'NPM_TOKEN', 'NODE_AUTH_TOKEN', 'REPOCTL_RELEASE_TOKEN', 'create-github-app-token', 'repoctl@latest']) {
      assert.ok(!JSON.stringify(job).includes(forbidden), `Bootstrap isolated job must not use ${forbidden}`)
    }
  }
  const verifying = JSON.stringify(verify)
  assert.ok(verifying.includes('--stage verify'))
  assert.ok(verifying.includes('--verify-run-id'))
  assert.ok(!verifying.includes('--stage publish'))
}
