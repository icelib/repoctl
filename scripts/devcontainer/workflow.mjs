import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'

export function checkDevContainerWorkflow(root) {
  const workflow = YAML.parse(readFileSync(path.join(root, '.github/workflows/devcontainer.yml'), 'utf8'))
  assert.equal(workflow.permissions.contents, 'read')
  assert.ok(Object.hasOwn(workflow.on, 'workflow_dispatch'))
  const job = workflow.jobs.devcontainer
  assert.equal(job['timeout-minutes'], 25)
  assert.deepEqual(job.strategy.matrix.include, [
    { runner: 'ubuntu-24.04', arch: 'x64' },
    { runner: 'ubuntu-24.04-arm', arch: 'arm64' },
  ])
  assert.ok(job.steps.some(step => step.run === 'pnpm install --frozen-lockfile'))
  assert.ok(job.steps.some(step => step.run === 'pnpm test:packaged-devcontainer'))
  for (const step of job.steps) {
    if (step.uses) {
      assert.match(step.uses, /^[^/]+\/[^@]+@[0-9a-f]{40}$/u)
    }
  }
}
