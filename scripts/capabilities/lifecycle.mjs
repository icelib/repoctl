import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { run } from '../packaged-template/workspace.mjs'

export async function freePort() {
  const server = createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}

async function reachable(port) {
  try {
    return (await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(1000) })).ok
  }
  catch { return false }
}

async function until(predicate, label, timeout = 20000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (await predicate()) {
      return
    }
    await delay(100)
  }
  throw new Error(`Timed out: ${label}`)
}

function launch(file, args, cwd, ci = true) {
  let output = ''
  const env = { ...process.env, HUSKY: '0', TURBO_TELEMETRY_DISABLED: '1' }
  if (ci) {
    env.CI = 'true'
  }
  else {
    delete env.CI
  }
  const child = spawn(process.execPath, [file, ...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.on('data', (chunk) => {
    output += chunk
  })
  child.stderr.on('data', (chunk) => {
    output += chunk
  })
  let exited = false
  const done = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      exited = true
      resolve({ code, signal })
    })
  })
  return { child, done, output: () => output, exited: () => exited }
}

async function stop(session) {
  if (!session.exited()) {
    session.child.kill('SIGINT')
    try {
      await until(() => session.exited(), 'owned runner shutdown', 15000)
    }
    catch (error) {
      session.child.kill('SIGTERM')
      await until(() => session.exited(), 'owned runner termination', 5000)
      throw error
    }
  }
  await session.done
}

export async function checkLifecycle({ workspace, app, e2e, localPort, ciPort }) {
  const require = createRequire(path.join(e2e, 'package.json'))
  const cli = require.resolve('@playwright/test/cli')
  const args = ['test', '--retries=0', '--timeout=1500', '--workers=1']
  const execute = async (ci = true, interrupt = false) => {
    const session = launch(cli, args, e2e, ci)
    try {
      if (interrupt) {
        await until(() => session.output().includes('INTERRUPT_READY'), 'active test before interruption')
        assert.equal(await reachable(ciPort), true)
        session.child.kill('SIGINT')
      }
      await until(() => session.exited(), 'Playwright completion', 45000)
      const result = await session.done
      console.log(session.output())
      return result
    }
    finally { await stop(session) }
  }
  console.log(run('pnpm', ['test:e2e'], workspace))
  await until(async () => !await reachable(ciPort), 'server stopped after success')
  const interaction = path.join(e2e, 'tests/interaction.spec.ts')
  const original = await readFile(interaction, 'utf8')
  try {
    await writeFile(interaction, original.replace('Count: 1', 'a deliberately missing result'))
    assert.equal((await execute()).code, 1)
    await until(async () => !await reachable(ciPort), 'server stopped after failure')
    const results = await readdir(path.join(e2e, 'test-results'), { recursive: true })
    assert.ok(results.some(file => file.endsWith('trace.zip')), 'failed test retains a trace')
    await writeFile(interaction, 'import { test } from \'@playwright/test\'\ntest(\'interrupt\', async ({ page }) => { test.setTimeout(60000); await page.goto(\'/\'); console.log(\'INTERRUPT_READY\'); await page.waitForTimeout(60000) })\n')
    const interrupted = await execute(true, true)
    assert.notEqual(interrupted.code, 0)
    await until(async () => !await reachable(ciPort), 'server stopped after interruption')
  }
  finally { await writeFile(interaction, original) }
  const appRequire = createRequire(path.join(app, 'package.json'))
  const vite = path.join(path.dirname(appRequire.resolve('vite/package.json')), 'bin/vite.js')
  const borrowed = launch(vite, ['preview', '--host', '127.0.0.1', '--port', String(localPort), '--strictPort'], app, false)
  try {
    await until(() => reachable(localPort), 'external preview server')
    assert.equal((await execute(false)).code, 0)
    assert.equal(borrowed.exited(), false)
    assert.equal(await reachable(localPort), true, 'a reused server remains owned by its starter')
  }
  finally {
    await stop(borrowed)
    await until(async () => !await reachable(localPort), 'external fixture server cleanup')
  }
}
