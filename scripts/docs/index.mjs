import assert from 'node:assert/strict'
import { once } from 'node:events'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fixture, previewWorkflow, reusableWorkflow, workflows } from './fixture.mjs'

const root = mkdtempSync(path.join(tmpdir(), 'repoctl-packaged-docs-'))
let server
try {
  const h = fixture(root)
  const byPath = (plan, filename) => plan.files.find(file => file.path === filename)
  async function apply(plan) {
    const filename = path.join(root, 'upgrade-plan.json')
    writeFileSync(filename, JSON.stringify(plan))
    return h.invoke(['upgrade', '--apply', filename, '--json'])
  }

  h.configure(false)
  const disabled = await h.invoke(['upgrade', '--json'])
  assert.equal(disabled.status, 'ready')
  assert.equal(byPath(disabled, previewWorkflow).reason, 'docs-not-configured')
  assert.equal(byPath(disabled, previewWorkflow).status, 'skip')
  assert.equal(byPath(disabled, reusableWorkflow).status, 'add')
  await apply(disabled)
  assert.equal(existsSync(path.join(h.workspace, previewWorkflow)), false)
  assert.equal(existsSync(path.join(h.workspace, reusableWorkflow)), true)

  h.configure(true)
  const enabled = await h.invoke(['upgrade', '--json'])
  assert.equal(byPath(enabled, previewWorkflow).status, 'add')
  await apply(enabled)
  const expectedWorkflows = new Map(workflows.map(filename => [filename, readFileSync(path.join(h.workspace, filename), 'utf8')]))
  assert.match(expectedWorkflows.get(previewWorkflow), /^# repoctl-managed: docs/)
  assert.match(expectedWorkflows.get(reusableWorkflow), /^# repoctl-managed: docs/)
  assert.match(expectedWorkflows.get(previewWorkflow), /github\.event_name == 'push' && 'preview'/)
  assert.match(expectedWorkflows.get(reusableWorkflow), /repo docs deploy/)
  const repeated = await h.invoke(['upgrade', '--json'])
  for (const filename of workflows) {
    assert.equal(byPath(repeated, filename).status, 'identical')
  }
  assert.equal((await apply(repeated)).status, 'unchanged')
  for (const filename of workflows) {
    assert.equal(readFileSync(path.join(h.workspace, filename), 'utf8'), expectedWorkflows.get(filename))
    writeFileSync(path.join(h.workspace, filename), 'name: Custom deployment\non: [workflow_dispatch]\njobs: {}\n')
  }
  const custom = await h.invoke(['upgrade', '--overwrite', '--json'])
  for (const filename of workflows) {
    assert.equal(byPath(custom, filename).reason, 'custom-docs-protected')
    assert.equal(byPath(custom, filename).status, 'skip')
    writeFileSync(path.join(h.workspace, filename), expectedWorkflows.get(filename))
  }
  console.log('Packaged workflow opt-in, custom preservation and repeated upgrades passed.')

  h.git(['add', '.'])
  h.git(['-c', `core.hooksPath=${root}`, 'commit', '-m', 'test: freeze documentation fixture'])
  const sourceSha = h.git(['rev-parse', 'HEAD'])
  h.git(['update-ref', 'refs/remotes/origin/main', sourceSha])
  const requests = []
  server = createServer((request, response) => {
    requests.push({ method: request.method, url: request.url })
    const expected = '/repos/smoke/docs/contents/.repoctl-automation/docs/guide/preview.json?ref=repoctl-release-state'
    response.writeHead(request.method === 'GET' && request.url === expected ? 404 : 405, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ message: 'Fixture state does not exist' }))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const env = {
    GITHUB_API_URL: `http://127.0.0.1:${server.address().port}`,
    GITHUB_REPOSITORY: 'smoke/docs',
    GITHUB_TOKEN: 'fixture-read-only-token',
  }
  const before = h.git(['status', '--porcelain'])
  const args = ['docs', 'plan', 'guide', '--channel', 'preview', '--source-sha', sourceSha, '--json']
  const preview = await h.invoke(args, env)
  assert.equal(preview.eligible, true)
  assert.equal(preview.skipped, false)
  assert.equal(preview.sourceSha, sourceSha)
  assert.equal(preview.channel, 'preview')
  assert.deepEqual(preview.blockers, [])
  assert.match(preview.deploymentId, /^[a-f\d]{64}$/)
  assert.equal(preview.treeSha, h.git(['rev-parse', 'HEAD^{tree}']))
  const replay = await h.invoke(args, env)
  assert.equal(replay.deploymentId, preview.deploymentId)
  assert.equal(h.git(['status', '--porcelain']), before)
  assert.equal(requests.length, 2)
  assert.ok(requests.every(request => request.method === 'GET'))
  console.log('Packaged CLI loaded the installed config and planned the frozen preview twice with identical identity and no writes.')
}
finally {
  if (server) {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
  rmSync(root, { recursive: true, force: true })
}
