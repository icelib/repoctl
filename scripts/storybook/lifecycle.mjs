import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

async function until(predicate, label, timeout = 60000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await predicate()) {
      return
    }
    await delay(100)
  }
  throw new Error(`Timed out: ${label}`)
}

function processes() {
  return execFileSync('ps', ['-eo', 'pid=,ppid=,stat='], { encoding: 'utf8' }).trim().split('\n').map(line => line.trim().split(/\s+/).slice(0, 3))
}

function descendants(pid) {
  const owned = new Set([pid])
  const rows = processes()
  for (let pass = 0; pass < 12; pass++) {
    for (const [child, parent] of rows) {
      if (owned.has(Number(parent))) {
        owned.add(Number(child))
      }
    }
  }
  return owned
}

export async function checkStorybookLifecycle({ directory, framework }) {
  const file = path.join(directory, `stories/component.stories.${framework === 'vue' ? 'ts' : 'tsx'}`)
  const original = await readFile(file, 'utf8')
  const require = createRequire(path.join(directory, 'package.json'))
  const cli = path.join(path.dirname(require.resolve('vitest/package.json')), 'vitest.mjs')
  try {
    for (const interrupt of [false, true]) {
      const marker = 'console.log(\'STORYBOOK_READY\', globalThis.location.origin)'
      const action = interrupt ? 'await new Promise(() => {})' : 'await new Promise(resolve => setTimeout(resolve, 1000)); throw new Error(\'intentional lifecycle failure\')'
      const mutated = original.replace('    const canvas = within(canvasElement)', `    ${marker}\n    ${action}\n    const canvas = within(canvasElement)`)
      assert.notEqual(mutated, original)
      await writeFile(file, mutated)
      let output = ''
      let exited = false
      let owned = new Set()
      const child = spawn(process.execPath, [cli, 'run', '--config', 'vitest.config.ts', '--testTimeout=60000'], { cwd: directory, env: { ...process.env, CI: 'true', NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'] })
      child.stdout.on('data', chunk => output += chunk)
      child.stderr.on('data', chunk => output += chunk)
      const done = new Promise((resolve, reject) => {
        child.once('error', reject)
        child.once('exit', (code) => {
          exited = true
          resolve(code)
        })
      })
      try {
        await until(() => output.includes('STORYBOOK_READY') || exited, 'actual browser play execution')
        assert.equal(exited, false, output)
        owned = descendants(child.pid)
        const origin = output.match(/STORYBOOK_READY\s+(https?:\/\/[\w.:/-]+)/)?.[1]
        assert.ok(origin, output)
        if (interrupt) {
          child.kill('SIGINT')
        }
        await until(() => exited, 'Vitest runner exit')
        assert.notEqual(await done, 0, output)
        await until(() => !processes().some(([pid, , stat]) => owned.has(Number(pid)) && !stat.startsWith('Z')), 'owned browser process cleanup', 15000)
        await assert.rejects(fetch(origin, { signal: AbortSignal.timeout(1000) }), 'owned browser server is closed')
        console.log(`Storybook ${framework}: ${interrupt ? 'SIGINT' : 'failure'} closed owned browser/server.`)
      }
      finally {
        if (!exited) {
          child.kill('SIGINT')
          await until(() => exited, 'interrupted runner cleanup', 15000).catch(async (error) => {
            child.kill('SIGTERM')
            await until(() => exited, 'runner termination', 5000)
            throw error
          })
        }
        await done
      }
    }
  }
  finally { await writeFile(file, original) }
}
