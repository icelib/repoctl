import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { checkApproval, checkOrchestration, checkValidators } from './pr-ci/jobs.mjs'
import { githubExpression, readWorkflow } from './shared.mjs'

function checkPullRequestEntrypoints(rootDir) {
  const directory = path.join(rootDir, '.github', 'workflows')
  for (const filename of fs.readdirSync(directory).filter(name => /\.ya?ml$/u.test(name))) {
    const { workflow } = readWorkflow(rootDir, filename)
    if (filename !== 'pr-ci.yml') {
      assert.equal(workflow.on?.pull_request, undefined, `${filename} must not bypass PR approval`)
      assert.equal(workflow.on?.pull_request_target, undefined, `${filename} must not bypass PR approval`)
    }
  }
}

function checkConcurrency(workflow, manual) {
  assert.deepEqual(workflow.permissions, { contents: 'read' })
  assert.equal(workflow.concurrency?.['cancel-in-progress'], true)
  assert.equal(workflow.concurrency?.queue, undefined, 'Selected PRs retain the complete parallel matrix')
  const group = workflow.concurrency?.group
  assert.ok(group?.includes('format(\'pr-ci-{0}\''), 'Native and manual runs must share the same per-PR cancellation group')
  assert.ok(group.includes(manual ? 'inputs.pr_number' : 'pull_request.number'))
  assert.ok(group.includes('pr-ci-ignored-'), 'Ignored events must not cancel approved checks')
}

export function checkPrCiWorkflow(rootDir) {
  checkPullRequestEntrypoints(rootDir)
  const { workflow } = readWorkflow(rootDir, 'pr-ci.yml')
  assert.equal(workflow['run-name'], `PR checks for #${githubExpression('github.event.pull_request.number')}`)
  assert.deepEqual(Object.keys(workflow.on ?? {}), ['pull_request', 'pull_request_target'])
  assert.deepEqual(workflow.on.pull_request.types, ['opened', 'synchronize', 'reopened', 'ready_for_review', 'labeled', 'unlabeled'])
  assert.deepEqual(workflow.on.pull_request_target.types, ['closed', 'converted_to_draft'])
  checkConcurrency(workflow, false)
  checkApproval(workflow, false)
  checkOrchestration(workflow, false)
  checkValidators(workflow, false)

  const { workflow: manual } = readWorkflow(rootDir, 'pr-ci-manual.yml')
  assert.deepEqual(Object.keys(manual.on ?? {}), ['workflow_dispatch'])
  assert.equal(manual.on.workflow_dispatch.inputs?.pr_number?.required, true)
  assert.equal(manual.on.workflow_dispatch.inputs?.pr_number?.type, 'string')
  checkConcurrency(manual, true)
  checkApproval(manual, true)
  checkOrchestration(manual, true)
  checkValidators(manual, true)
}
