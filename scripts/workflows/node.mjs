import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { readWorkflow } from './shared.mjs'

/** Every standalone job uses the reviewed LTS; CI validates each supported security floor. */
export function checkWorkflowNodeVersions(rootDir) {
  const directory = path.join(rootDir, '.github/workflows')
  for (const filename of fs.readdirSync(directory).filter(name => /\.ya?ml$/u.test(name))) {
    const { workflow } = readWorkflow(rootDir, filename)
    for (const [name, job] of Object.entries(workflow.jobs ?? {})) {
      for (const step of job.steps ?? []) {
        if (!step.uses?.startsWith('actions/setup-node@')) {
          continue
        }
        const expected = filename === 'ci.yml' && name === 'build' ? '$' + '{{ matrix.node-version }}' : '24.22.1'
        assert.equal(step.with?.['node-version'], expected, `${filename}/${name} must select the reviewed Node runtime`)
      }
    }
  }
}
