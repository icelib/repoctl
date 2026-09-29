import assert from 'node:assert/strict'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { declarations, run } from './workspace.mjs'

function tasks(workspace) {
  return JSON.parse(run('pnpm', ['exec', 'turbo', 'run', 'build', 'typecheck', '--dry=json'], workspace)).tasks
}

function hashes(workspace) {
  return Object.fromEntries(tasks(workspace).map(task => [task.taskId, task.hash]))
}

export function checkCacheInputs(workspace) {
  const before = hashes(workspace)
  for (const [relative, content] of [
    ['apps/server/cloudflare.config.ts', '\n// compatibility and bindings are cache inputs\n'],
    ['apps/server/wrangler.config.ts', '\n// tooling changes invalidate tasks\n'],
    ['apps/client/cloudflare.config.ts', '\n// client configuration changes invalidate tasks\n'],
    ['apps/client/worker/cache-input.ts', 'export {}\n'],
    ['apps/server/.dev.vars', 'CACHE_TEST=value\n'],
    ['apps/server/.env', 'CACHE_TEST=value\n'],
  ]) {
    const file = path.join(workspace, relative)
    const original = existsSync(file) ? readFileSync(file, 'utf8') : undefined
    try {
      writeFileSync(file, `${original ?? ''}${content}`)
      const after = hashes(workspace)
      const name = relative.includes('/client/') ? 'client' : 'server'
      for (const task of ['build', 'typecheck']) {
        const id = `@icebreakers/${name}#${task}`
        assert.notEqual(after[id], before[id], `${relative} must invalidate ${id}`)
      }
    }
    finally {
      if (original === undefined) {
        rmSync(file)
      }
      else {
        writeFileSync(file, original)
      }
    }
  }
  // Simulate a transitive workerd update without changing package.json.
  const lockPath = path.join(workspace, 'pnpm-lock.yaml')
  const lock = readFileSync(lockPath, 'utf8')
  const documents = YAML.parseAllDocuments(lock).map(doc => doc.toJS())
  const changed = documents.find(doc => doc.importers?.['apps/client'])
  assert.ok(changed)
  for (const records of [changed.packages, changed.snapshots]) {
    const key = Object.keys(records).find(key => key.startsWith('workerd@'))
    assert.ok(key, 'the fixture must contain workerd')
    records['workerd@0.0.0'] = records[key]
    delete records[key]
  }
  for (const snapshot of Object.values(changed.snapshots)) {
    if (snapshot.dependencies?.workerd) {
      snapshot.dependencies.workerd = '0.0.0'
    }
  }
  try {
    writeFileSync(lockPath, documents.map(doc => `---\n${YAML.stringify(doc)}`).join('\n'))
    const next = hashes(workspace)
    for (const id of Object.keys(before)) {
      assert.notEqual(next[id], before[id], `workerd update must invalidate ${id}`)
    }
  }
  finally {
    writeFileSync(lockPath, lock)
  }
}

export function checkCacheRestore(workspace, task) {
  run('pnpm', ['run', task], workspace)
  const expected = new Map()
  for (const name of ['client', 'server']) {
    const file = path.join(workspace, 'apps', name, declarations)
    expected.set(file, readFileSync(file, 'utf8'))
    rmSync(file)
  }
  const clientOutput = path.join(workspace, 'apps/client/.cloudflare/output')
  if (task === 'build') {
    rmSync(clientOutput, { recursive: true, force: true })
  }
  const planned = tasks(workspace).filter(item => item.task === task)
  assert.ok(planned.every(item => item.cache.status === 'HIT'), `${task} must be cached before restoring declarations`)
  run('pnpm', ['run', task], workspace)
  if (task === 'build') {
    assert.ok(existsSync(path.join(clientOutput, 'v0/workers/default/bundle/index.js')), 'build cache must restore the Worker bundle')
    assert.ok(existsSync(path.join(clientOutput, 'v0/workers/default/assets/index.html')), 'build cache must restore client assets')
  }
  for (const [file, content] of expected) {
    assert.equal(readFileSync(file, 'utf8'), content, `${task} cache must restore declarations`)
  }
}
