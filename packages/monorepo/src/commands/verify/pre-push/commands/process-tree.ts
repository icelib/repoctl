import { execFile, spawn } from 'node:child_process'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'

const execute = promisify(execFile)
const gracePeriodMs = 5000

/** The caller must retain the snapshot when owned processes may still use it. */
export class PushProcessCleanupError extends Error {}

function signalGroup(pid: number, signal: NodeJS.Signals | 0) {
  try {
    process.kill(-pid, signal)
    return true
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
      return false
    }
    throw error
  }
}

async function groupRunning(pid: number) {
  if (!signalGroup(pid, 0)) {
    return false
  }
  // An orphaned zombie may retain its PGID until init reaps it. It cannot run
  // scripts or access the snapshot, so waiting for kill(0) alone can deadlock.
  // Read only PGID/state; never select or terminate another process by name.
  const { stdout } = await execute('ps', ['-axo', 'pgid=,stat='], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    timeout: 2000,
    killSignal: 'SIGKILL',
  })
  const rows = stdout.trim().split('\n')
  let running = false
  for (const row of rows) {
    const match = /^(\d+)\s+(\S+)$/.exec(row.trim())
    if (!match) {
      throw new Error('Could not read process group states from ps.')
    }
    if (Number(match[1]) === pid && !match[2]!.startsWith('Z')) {
      running = true
    }
  }
  return running
}

async function waitForGroup(pid: number) {
  const deadline = Date.now() + gracePeriodMs
  while (await groupRunning(pid)) {
    if (Date.now() >= deadline) {
      return false
    }
    await delay(50)
  }
  return true
}

async function stopPosixGroup(pid: number, signal: NodeJS.Signals) {
  if (!signalGroup(pid, signal)) {
    return
  }
  try {
    if (await waitForGroup(pid)) {
      return
    }
  }
  catch (error) {
    // A failed inspection must not leave an otherwise killable group running.
    signalGroup(pid, 'SIGKILL')
    throw error
  }
  if (signalGroup(pid, 'SIGKILL') && !await waitForGroup(pid)) {
    throw new Error(`Process group ${pid} did not stop after SIGKILL.`)
  }
}

function stopWindowsTree(pid: number) {
  return new Promise<void>((resolve, reject) => {
    // Force the owned tree in a single operation. Gracefully killing the root
    // first loses taskkill's ability to discover surviving descendants.
    const killer = spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' })
    let failure: Error | undefined
    const timeout = setTimeout(() => {
      failure = new Error('taskkill did not finish within 5 seconds.')
      try {
        // This is the helper we just spawned, never a process found by name.
        killer.kill('SIGKILL')
      }
      catch (cause) {
        failure = new Error('Could not terminate the timed-out taskkill helper.', { cause })
      }
      killer.unref()
      reject(failure)
    }, gracePeriodMs)
    killer.once('error', (error) => {
      failure = error
    })
    killer.once('close', (status, signal) => {
      clearTimeout(timeout)
      if (failure || status !== 0) {
        reject(failure ?? new Error(`taskkill exited with ${status ?? signal}.`))
      }
      else {
        resolve()
      }
    })
  })
}

/** Only the detached POSIX group or the exact Windows PID tree is owned. */
export async function stopPushProcessTree(pid: number, signal: NodeJS.Signals, platform = process.platform) {
  try {
    if (platform === 'win32') {
      await stopWindowsTree(pid)
    }
    else {
      await stopPosixGroup(pid, signal)
    }
  }
  catch (cause) {
    throw new PushProcessCleanupError(`Could not stop pre-push process tree ${pid}.`, { cause })
  }
}
