import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { runPushCommand } from '@/commands/verify/pre-push/commands'

export function processRunning(pid: number) {
  try {
    process.kill(pid, 0)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
      return false
    }
    throw error
  }
  if (process.platform === 'win32') {
    return true
  }
  try {
    return !execFileSync('ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8' }).trim().startsWith('Z')
  }
  catch (error) {
    if ((error as { status?: number }).status === 1) {
      return false
    }
    throw error
  }
}

export async function readReadyPid(file: string) {
  for (let attempt = 0; attempt < 200; attempt++) {
    try {
      const pid = Number(await readFile(file, 'utf8'))
      if (Number.isInteger(pid) && pid > 0) {
        return pid
      }
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
    await delay(25)
  }
  throw new Error(`Process did not become ready: ${file}`)
}

export async function createProcessFixture(exitLeader = false) {
  const directory = await mkdtemp(path.join(tmpdir(), 'repoctl-push-process-'))
  const leaderTrace = path.join(directory, 'leader.pid')
  const descendantTrace = path.join(directory, 'descendant.pid')
  const descendant = `
    import { writeFileSync } from 'node:fs'
    process.on('SIGINT', () => {})
    process.on('SIGTERM', () => {})
    writeFileSync(process.argv[1], String(process.pid))
    setInterval(() => {}, 1000)
  `
  const script = path.join(directory, 'leader.mjs')
  await writeFile(script, `
    import { spawn } from 'node:child_process'
    import { existsSync, writeFileSync } from 'node:fs'
    process.on('SIGINT', () => process.exit(0))
    process.on('SIGTERM', () => process.exit(0))
    spawn(process.execPath, ['--input-type=module', '-e', ${JSON.stringify(descendant)}, ${JSON.stringify(descendantTrace)}], { stdio: 'ignore' }).unref()
    writeFileSync(${JSON.stringify(leaderTrace)}, String(process.pid))
    setInterval(() => {
      if (${exitLeader} && existsSync(${JSON.stringify(descendantTrace)})) process.exit(0)
    }, 10)
  `)
  const controller = new AbortController()
  // Capture rejection from creation time, including failure before readiness.
  const result = runPushCommand(process.execPath, [script], directory, process.env, controller.signal)
    .then(() => ({ error: undefined }), (error: unknown) => ({ error }))
  return {
    directory,
    controller,
    result,
    leaderTrace,
    descendantTrace,
    async cleanup() {
      controller.abort('SIGTERM')
      await result
      let leaderPid: number | undefined
      let descendantPid: number | undefined
      try {
        leaderPid = Number(await readFile(leaderTrace, 'utf8'))
        descendantPid = Number(await readFile(descendantTrace, 'utf8'))
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error
        }
      }
      // Exact fixture identities only; this also cleans up when the test catches
      // a regression that prematurely settles while its descendant is alive.
      for (const pid of [descendantPid, leaderPid]) {
        if (pid && processRunning(pid)) {
          process.kill(pid, 'SIGKILL')
        }
      }
      await rm(directory, { recursive: true, force: true, maxRetries: 3 })
    },
  }
}
