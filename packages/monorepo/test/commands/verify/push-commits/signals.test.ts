import { spawn } from 'node:child_process'
import { realpath } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { describe, expect, it } from 'vitest'
import fs from '@/utils/fs'
import { createPushFixture, expectCleanedSnapshots, pushLine, snapshotOriginal } from './fixtures'

interface RunningCheck {
  cwd: string
  pid: number
}

function isRunning(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
      return false
    }
    throw error
  }
}

async function stopOwnedProcess(pid: number | undefined) {
  if (!pid || !isRunning(pid)) {
    return
  }
  process.kill(pid, 'SIGTERM')
  for (let attempt = 0; attempt < 40 && isRunning(pid); attempt++) {
    await delay(50)
  }
  if (isRunning(pid)) {
    process.kill(pid, 'SIGKILL')
  }
}

describe('built pre-push interruption cleanup', () => {
  it('cleans its snapshot after SIGTERM reaches the default executor', async () => {
    const repo = await createPushFixture()
    const trace = path.join(repo.directory, 'running-check.json')
    let running: RunningCheck | undefined
    let child: ReturnType<typeof spawn> | undefined
    let hardTimeout: ReturnType<typeof setTimeout> | undefined
    try {
      await repo.put('modules/a/check.mjs', `
        import { writeFileSync } from 'node:fs'
        writeFileSync(process.env.REPOCTL_PUSH_SIGNAL_TRACE, JSON.stringify({ cwd: process.cwd(), pid: process.pid }))
        setInterval(() => {}, 1000)
        setTimeout(() => process.exit(0), 20000)
      `)
      const head = repo.commit('long running check')
      const before = await snapshotOriginal(repo)
      const moduleUrl = new URL('../../../../dist/index.mjs', import.meta.url).href
      const script = `
        const [moduleUrl, cwd, stdinText] = process.argv.slice(1)
        const { verifyPrePush } = await import(moduleUrl)
        process.on('message', message => { if (message === 'interrupt') process.emit('SIGTERM') })
        await verifyPrePush({ cwd, stdinText })
      `
      child = spawn(process.execPath, ['--input-type=module', '-e', script, moduleUrl, repo.cwd, pushLine('refs/heads/main', head, repo.main)], {
        cwd: repo.directory,
        env: { ...process.env, REPOCTL_PUSH_SIGNAL_TRACE: trace },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      })
      let output = ''
      child.stdout?.on('data', chunk => output += String(chunk))
      child.stderr?.on('data', chunk => output += String(chunk))
      const exited = new Promise<{ code: number | null, signal: NodeJS.Signals | null }>((resolve, reject) => {
        child!.once('error', reject)
        child!.once('exit', (code, signal) => resolve({ code, signal }))
      })
      hardTimeout = setTimeout(() => child?.kill('SIGKILL'), 15000)
      for (let attempt = 0; attempt < 400 && !await fs.pathExists(trace); attempt++) {
        await delay(50)
      }
      expect(await fs.pathExists(trace), output).toBe(true)
      running = await fs.readJson(trace) as RunningCheck

      // Windows TerminateProcess bypasses Node signal handlers. Exercise the
      // same handler over IPC there; POSIX receives an actual OS signal.
      if (process.platform === 'win32') {
        child.send('interrupt')
      }
      else {
        expect(child.kill('SIGTERM')).toBe(true)
      }
      const result = await exited

      expect(result.code === 143 || result.signal === 'SIGTERM', output).toBe(true)
      await expectCleanedSnapshots(repo, [{ kind: 'check', cwd: running.cwd }])
      expect(await snapshotOriginal(repo)).toEqual(before)
    }
    finally {
      if (hardTimeout) {
        clearTimeout(hardTimeout)
      }
      if (child && child.exitCode === null && child.signalCode === null) {
        await stopOwnedProcess(child.pid)
      }
      await stopOwnedProcess(running?.pid)
      // A failed cleanup assertion must not leave this fixture's clone behind.
      if (running && await fs.pathExists(running.cwd)
        && await realpath(running.cwd) !== await realpath(path.join(repo.cwd, 'modules/a'))) {
        await fs.remove(path.resolve(running.cwd, '../..'))
      }
      await fs.remove(repo.directory)
    }
  }, 60000)
})
