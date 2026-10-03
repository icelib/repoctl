import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { setTimeout } from 'node:timers/promises'

async function availablePort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  return address.port
}

/** Run the generated start command through Next's CLI, and only stop this owned process tree. */
export async function startProductionServer(app) {
  const require = createRequire(path.join(app, 'package.json'))
  const port = await availablePort()
  const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: app,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', NO_COLOR: '1', FORCE_COLOR: '0' },
  })
  let output = ''
  let finished = false
  const closed = new Promise(resolve => child.once('close', () => {
    finished = true
    resolve()
  }))
  const append = (value) => {
    output = `${output}${value}`.slice(-16000)
  }
  child.stdout.on('data', append)
  child.stderr.on('data', append)
  child.on('error', error => append(error.message))
  const kill = (force = false) => {
    if (finished || !child.pid) {
      return
    }
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
      return
    }
    try {
      process.kill(-child.pid, force ? 'SIGKILL' : 'SIGTERM')
    }
    catch (error) {
      if (error.code !== 'ESRCH') {
        throw error
      }
    }
  }
  const exit = () => kill(true)
  process.once('exit', exit)
  const stop = async () => {
    kill()
    await Promise.race([closed, setTimeout(5000, undefined, { ref: false })])
    if (!finished) {
      kill(true)
      await Promise.race([closed, setTimeout(5000, undefined, { ref: false })])
    }
    process.removeListener('exit', exit)
    assert.equal(finished, true, 'the task-owned Next server must close')
  }
  const origin = `http://127.0.0.1:${port}`
  try {
    const deadline = Date.now() + 60000
    while (Date.now() < deadline) {
      if (finished) {
        break
      }
      if (/Ready in/u.test(output)) {
        try {
          const health = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(2000) })
          if (health.ok) {
            return { origin, stop }
          }
        }
        catch {}
      }
      await setTimeout(100)
    }
    throw new Error(`Next production server did not become healthy.\n${output}`)
  }
  catch (error) {
    await stop()
    throw error
  }
}
