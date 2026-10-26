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
      for (const step of job.steps ?? []) {
        if (step.uses?.startsWith('actions/setup-node@')) {
          assert.equal(step.with?.['node-version'], filename === 'ci.yml' ? '$' + '{{ matrix.node-version }}' : '24.22.1')
        }
      }
    }
    if (filename === 'ci.yml') {
      assert.deepEqual(workflow.jobs.build.strategy.matrix['node-version'], ['22.23.4', '24.22.1', '26.12.1'])
    }
    if (filename === 'release-intent-check.yml') {
      const steps = workflow.jobs['release-intent'].steps
      assert.ok(!steps.some(step => step.run?.includes('skipping validation')), 'A branch name must not grant a release exemption')
      const validation = steps.find(step => step.run?.includes('release validate-preparation'))
      assert.ok(validation, 'Release PRs must pass native preparation replay')
      assert.equal(validation['continue-on-error'], undefined)
      const trusted = steps.find(step => step.with?.path === 'release-validation-tools')
      assert.equal(trusted?.with?.ref, '$' + '{{ github.event.pull_request.base.sha }}')
      assert.equal(trusted?.with?.['persist-credentials'], false)
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
  for (const job of Object.values(release.jobs)) {
    for (const step of job.steps ?? []) {
      if (step.uses?.startsWith('actions/setup-node@')) {
        assert.equal(step.with?.['node-version'], '24.22.1')
      }
    }
  }
  const config = readFileSync(path.join(workspace, 'repoctl.config.ts'), 'utf8')
  assert.ok(!config.includes('17 19 * * *'))
  assert.ok(!config.includes('check:workflows'))
}
