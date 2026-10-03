import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { registry } from '../packaged-template/workspace.mjs'
import { archives, baseAsset, consumer, target } from './fixture.mjs'
import { publish } from './publisher.mjs'

const root = mkdtempSync(path.join(tmpdir(), 'repoctl-packaged-maintenance-presets-'))
let server
try {
  const fixture = archives(root)
  server = fork(path.join(import.meta.dirname, 'registry.mjs'), [fixture.catalogFile, registry], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
  const [{ port }] = await once(server, 'message')
  for (const localValue of [40, 41]) {
    const parent = path.join(root, `consumer-${localValue}`)
    mkdirSync(parent)
    const h = consumer(path.join(parent, 'workspace'), fixture, `http://127.0.0.1:${port}/`, localValue)
    const directory = path.join(parent, 'repoctl-maintenance-artifact')
    const report = JSON.parse(h.invoke(['maintenance', 'upgrade', '--base', h.base, '--head', h.head, '--out', directory]))
    assert.equal(report.status, 'ready', report.errors.join('; '))
    assert.equal(report.versions.status, 'unchanged')
    assert.equal(report.plan, null)
    assert.deepEqual(report.presets.versions.map(change => [change.from, change.to]), [['1.0.0', '2.0.0']])
    assert.ok(['lockfile', 'install', 'build', 'lint', 'test'].every(name => report.checks.some(check => check.name === name && check.status === 'passed')))
    assert.equal(readFileSync(path.join(h.root, target), 'utf8'), baseAsset.replace('first = 1', 'first = 10').replace('fourth = 4', `fourth = ${localValue}`))
    await publish(h, directory, parent, localValue)
    const head = h.commit('merge validated maintenance')
    for (const [label, base] of [['repeat', h.base], ['unrelated', head]]) {
      const unchanged = JSON.parse(h.invoke(['maintenance', 'upgrade', '--base', base, '--head', head, '--out', path.join(parent, label)]))
      assert.equal(unchanged.status, 'unchanged', unchanged.errors.join('; '))
      assert.deepEqual(unchanged.checks, [])
      assert.equal(unchanged.patchHash, null)
    }
    assert.equal(h.git(['status', '--porcelain']), '')
    assert.ok(!existsSync(fixture.marker))
    console.log(`Consumer ${localValue}: exact registry v1→v2, local customization, real checks, trusted publisher, repeat and unrelated no-ops passed.`)
  }
}
finally {
  if (server) {
    server.kill('SIGTERM')
    await once(server, 'exit')
  }
  if (process.env.REPOCTL_KEEP_MAINTENANCE_PRESET_FIXTURE === '1') {
    console.log(`Retained maintenance fixture: ${root}`)
  }
  else {
    rmSync(root, { recursive: true, force: true })
  }
}
