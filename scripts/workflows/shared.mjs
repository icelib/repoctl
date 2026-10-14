import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'

const pinnedActionPattern = /^[^/]+\/[^@]+@[0-9a-f]{40}$/
const githubExpressionPrefix = '$' + '{{'

export function githubExpression(body) {
  return `${githubExpressionPrefix} ${body} }}`
}

export function readWorkflow(rootDir, filename) {
  const source = fs
    .readFileSync(path.join(rootDir, '.github', 'workflows', filename), 'utf8')
    .replaceAll('\r\n', '\n')
  return {
    source,
    workflow: YAML.parse(source),
  }
}

export function getSteps(workflow, jobName) {
  const steps = workflow.jobs?.[jobName]?.steps
  assert.ok(Array.isArray(steps), `${jobName} must define workflow steps`)
  return steps
}

export function assertPinnedActions(steps, workflowName) {
  for (const step of steps) {
    if (step.uses) {
      assert.match(
        step.uses,
        pinnedActionPattern,
        `${workflowName} action must use a full commit SHA: ${step.uses}`,
      )
    }
  }
}

export function checkAppAuthentication(steps, condition) {
  const token = steps.find(step => step.id === 'app-token')
  const validation = steps.find(step => step.name === 'Validate GitHub App configuration')
  assert.ok(validation, 'App configuration must be validated before requesting a token')
  assert.ok(token)
  assert.ok(steps.indexOf(validation) < steps.indexOf(token))
  assert.equal(token.if, githubExpression(condition))
  assert.match(token.uses, /^actions\/create-github-app-token@[0-9a-f]{40}$/)
  assert.equal(token.with?.['client-id'], githubExpression('vars.REPOCTL_APP_CLIENT_ID'))
  assert.equal(token.with?.['private-key'], githubExpression('secrets.REPOCTL_APP_PRIVATE_KEY'))
  assert.equal(token.with?.['permission-contents'], 'write')
  assert.equal(token.with?.['permission-pull-requests'], 'write')
  // Omitting both scopes restricts the token to the calling repository.
  assert.equal(token.with?.owner, undefined)
  assert.equal(token.with?.repositories, undefined)
  assert.notEqual(token['continue-on-error'], true)
  assert.notEqual(token.with?.['skip-token-revoke'], true)
}

export function assertReusableValidation(workflow, inputs = ['ref']) {
  assert.deepEqual(Object.keys(workflow.on ?? {}), ['workflow_call'], 'PR validation must only run through the approval workflow')
  for (const name of inputs) {
    assert.equal(workflow.on.workflow_call.inputs?.[name]?.required, true)
    assert.equal(workflow.on.workflow_call.inputs?.[name]?.type, 'string')
  }
  assert.deepEqual(workflow.permissions, { contents: 'read' }, 'PR code must execute with read-only contents permissions')
  assert.equal(workflow.concurrency, undefined, 'Only the approval workflow may cancel an outdated PR run')
  for (const [name, job] of Object.entries(workflow.jobs ?? {})) {
    assert.ok(job.permissions !== 'write-all' && !Object.values(job.permissions ?? {}).includes('write'), 'Validation jobs must not request write permissions')
    const steps = getSteps(workflow, name)
    const checkout = steps.find(step => step.uses?.startsWith('actions/checkout@'))
    assert.ok(checkout, `${name} must check out the approved immutable revision`)
    assert.equal(checkout.with?.ref, githubExpression('inputs.ref'))
    assert.equal(checkout.with?.['persist-credentials'], false)
    assert.ok(!steps.some(step => step.uses?.startsWith('actions/create-github-app-token@')), 'Validation must not request GitHub App write credentials')
    assertPinnedActions(steps, name)
  }
}
