import type { ChildProcess } from 'node:child_process'
import type { CheckExecutionTask } from './types'
import { spawnSync } from 'node:child_process'
import { constants } from 'node:os'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import spawn from 'cross-spawn'

export function signalExitCode(signal: string) {
  return 128 + (constants.signals[signal as keyof typeof constants.signals] ?? 1)
}

function abortSignal(signal: AbortSignal): NodeJS.Signals {
  return signal.reason === 'SIGTERM' ? 'SIGTERM' : 'SIGINT'
}

export function stopCheckProcessTree(child: ChildProcess, signal: NodeJS.Signals) {
  if (!child.pid) {
    return
  }
  if (process.platform === 'win32') {
    // Kill only this invocation's process tree, including pnpm's script children.
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }
  try {
    process.kill(-child.pid, signal)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
      child.kill(signal)
    }
  }
}

export async function executeCheckTask(task: CheckExecutionTask, signal?: AbortSignal) {
  const start = performance.now()
  task.startedAt = new Date().toISOString()
  process.stdout.write(`[check:${task.name}] .\n`)

  await new Promise<void>((resolve) => {
    let child: ChildProcess | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let interrupted: NodeJS.Signals | undefined
    let settled = false
    const abort = () => {
      interrupted = abortSignal(signal!)
      if (child) {
        stopCheckProcessTree(child, interrupted)
        timer = setTimeout(() => child && stopCheckProcessTree(child, 'SIGKILL'), 3000)
        timer.unref()
      }
    }
    const finish = (code: number | null, childSignal: NodeJS.Signals | null, error?: Error) => {
      if (settled) {
        return
      }
      settled = true
      signal?.removeEventListener('abort', abort)
      if (timer) {
        clearTimeout(timer)
      }
      if (interrupted && child) {
        stopCheckProcessTree(child, 'SIGKILL')
      }
      task.endedAt = new Date().toISOString()
      task.durationMs = Math.max(0, performance.now() - start)
      task.signal = interrupted ?? childSignal
      task.exitCode = code
      task.status = task.signal ? 'interrupted' : error || code !== 0 ? 'failed' : 'success'
      if (error) {
        // Do not persist arbitrary error messages, child output, or environment values.
        task.errorCode = (error as NodeJS.ErrnoException).code ?? 'SPAWN_ERROR'
        task.reason = 'command_start_failed'
      }
      resolve()
    }
    try {
      child = spawn(task.executable, task.args, {
        cwd: task.cwd,
        stdio: 'inherit',
        detached: process.platform !== 'win32',
      })
      child.once('error', error => finish(null, null, error))
      child.once('close', (code, childSignal) => finish(code, childSignal))
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) {
        abort()
      }
    }
    catch (error) {
      finish(null, null, error as Error)
    }
  })
}
