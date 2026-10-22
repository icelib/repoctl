import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'

/** Check the shipped workflow boundary in both package assets and generated workspaces. */
export function checkConsumerWorkflows(workspace) {
  const github = path.join(workspace, '.github')
  for (const [filename, event] of [
    ['ci.yml', 'pull_request'],
    ['release-intent-auto.yml', 'pull_request_target'],
    ['release-intent-check.yml', 'pull_request'],
  ]) {
    const workflow = YAML.parse(readFileSync(path.join(github, 'workflows', filename), 'utf8'))
    assert.ok(workflow.on[event], `${filename} must keep its automatic consumer event`)
    assert.equal(workflow.on.workflow_call, undefined, `${filename} must remain a standalone workflow`)
    for (const job of Object.values(workflow.jobs)) {
      assert.equal(job.environment, undefined, `${filename} must not require source-repository approval`)
    }
  }
  assert.equal(existsSync(path.join(github, 'workflows/pr-ci.yml')), false)
  assert.equal(existsSync(path.join(github, 'workflows/pr-ci-manual.yml')), false)
  assert.equal(existsSync(path.join(github, 'workflows/devcontainer.yml')), false)
  assert.equal(existsSync(path.join(github, 'pr-ci')), false)
  assert.equal(existsSync(path.join(github, 'nightly')), false)
  const releaseContent = readFileSync(path.join(github, 'workflows/release.yml'), 'utf8')
  const release = YAML.parse(releaseContent)
  assert.equal(release.permissions.actions, undefined, 'consumer release must not dispatch source approval workflows')
  assert.ok(!releaseContent.includes('pr-ci'), 'consumer release must not call omitted source-only tooling')
  assert.equal(release.on.schedule, undefined, 'consumer releases must not inherit source nightly scheduling')
  assert.ok(release.jobs.nightly)
  assert.ok(release.on.workflow_dispatch.inputs.mode.options.includes('nightly'))
  assert.ok(!releaseContent.includes('.github/nightly/'))
  assert.equal(release.jobs.nightly.env.REPOCTL_NIGHTLY_PROVIDER, 'npm')
  assert.equal(release.jobs.nightly.env.REPOCTL_NIGHTLY_SCHEDULE, '')
  const config = readFileSync(path.join(workspace, 'repoctl.config.ts'), 'utf8')
  assert.ok(!config.includes('17 19 * * *'))
  assert.ok(!config.includes('check:workflows'))
}
