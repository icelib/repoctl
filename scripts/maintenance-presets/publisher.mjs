import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { run } from '../packaged-template/workspace.mjs'
import { baseAsset, target } from './fixture.mjs'

/** Run the exported trusted script with API fixtures in a clone with no installed dependencies. */
export async function publish(h, directory, parent, localValue) {
  const cwd = path.join(parent, 'publisher')
  run('git', ['clone', '-q', '--no-hardlinks', h.root, cwd], parent)
  const script = YAML.parse(h.workflow).jobs.propose.steps.find(step => step.id === 'verify').with.script
  const request = async route => ({ data: route.endsWith('/branches/{branch}') ? { commit: { sha: h.head } } : route.endsWith('/actions/artifacts/{artifact_id}') ? { id: 456, name: 'repoctl-maintenance-123-1', expired: false, digest: `sha256:${'a'.repeat(64)}`, workflow_run: { id: 123, head_sha: h.head } } : { full_name: 'acme/example', default_branch: 'main' } })
  const outputs = new Map()
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
  await new AsyncFunction('github', 'context', 'core', 'process', script)(
    { request },
    { repo: { owner: 'acme', repo: 'example' }, sha: h.head, payload: { repository: { default_branch: 'main' } } },
    { setOutput: (name, value) => outputs.set(name, value) },
    { env: { GITHUB_WORKSPACE: cwd, RUNNER_TEMP: path.dirname(directory), GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', BASE_SHA: h.base, ARTIFACT_ID: '456', ARTIFACT_DIGEST: 'a'.repeat(64), APP_CONFIGURED: 'true' } },
  )
  assert.equal(outputs.get('ready'), 'true')
  assert.equal(readFileSync(path.join(cwd, target), 'utf8'), baseAsset.replace('first = 1', 'first = 10').replace('fourth = 4', `fourth = ${localValue}`))
  const baselineFile = `.repoctl/baselines/presets/${createHash('sha256').update(target).digest('hex')}.json`
  const baseline = JSON.parse(readFileSync(path.join(cwd, baselineFile), 'utf8'))
  assert.equal(baseline.source.version, '2.0.0')
  assert.equal(Buffer.from(baseline.upstream.content, 'base64').toString(), baseAsset.replace('first = 1', 'first = 10'))
  assert.ok(!existsSync(path.join(cwd, 'node_modules')))
  assert.ok(readFileSync(outputs.get('body-file'), 'utf8').includes('2.0.0'))
}
