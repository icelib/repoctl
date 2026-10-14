import assert from 'node:assert/strict'
import { checkNimbusUpgradeWorkflow } from '../nimbus/workflow.mjs'
import { assertReusableValidation, readWorkflow } from '../workflows/shared.mjs'

export function checkDevContainerWorkflow(root) {
  const { workflow } = readWorkflow(root, 'devcontainer.yml')
  assertReusableValidation(workflow)
  const job = workflow.jobs.devcontainer
  checkNimbusUpgradeWorkflow(job.steps)
  assert.equal(job['continue-on-error'], undefined)
  assert.equal(job['timeout-minutes'], 25)
  assert.deepEqual(job.strategy.matrix.include, [
    { runner: 'ubuntu-24.04', arch: 'x64' },
    { runner: 'ubuntu-24.04-arm', arch: 'arm64' },
  ])
  assert.ok(job.steps.some(step => step.run === 'pnpm install --frozen-lockfile'))
  assert.ok(job.steps.some(step => step.run === 'pnpm test:packaged-devcontainer'))
}
