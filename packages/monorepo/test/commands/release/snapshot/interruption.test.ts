import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { access } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { setTimeout } from 'node:timers/promises'
import crossSpawn from 'cross-spawn'
import { expect, it } from 'vitest'
import { fixture, snapshot } from './fixture'

it('leaves original intents, manifests and Git refs unchanged when preparation is terminated', async () => {
  const h = await fixture()
  const marker = path.join(h.root, 'build-started')
  await h.write('build.cjs', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'started'); setInterval(() => {}, 1000)`)
  h.run('git', ['add', '.'])
  h.run('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'long build'])
  const commit = h.run('git', ['rev-parse', 'HEAD'])
  const before = await snapshot(h.cwd)
  const child = spawn(process.execPath, [
    path.resolve(import.meta.dirname, '../../../../bin/repo.js'),
    'release',
    'snapshot',
    '--kind',
    'nightly',
    '--commit',
    commit,
    '--build-id',
    'interrupted-build',
    '--output',
    path.join(h.root, 'output'),
  ], { cwd: h.cwd, env: h.options.env, detached: process.platform !== 'win32', stdio: 'ignore' })
  const exit = once(child, 'exit')
  try {
    let started = false
    const deadline = Date.now() + 60_000
    while (Date.now() < deadline && child.exitCode === null) {
      try {
        await access(marker)
        started = true
        break
      }
      catch {
        await setTimeout(100)
      }
    }
    expect(started).toBe(true)
  }
  finally {
    if (child.pid && child.exitCode === null) {
      if (process.platform === 'win32') {
        crossSpawn.sync('taskkill', ['/pid', String(child.pid), '/T', '/F'])
      }
      else {
        process.kill(-child.pid, 'SIGTERM')
      }
    }
    await exit
  }
  expect(await snapshot(h.cwd)).toEqual(before)
  expect(h.uploads).toEqual([])
}, 90_000)
