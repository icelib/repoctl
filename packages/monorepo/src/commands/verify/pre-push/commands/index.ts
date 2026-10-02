import type { spawnSync } from 'node:child_process'
import { constants } from 'node:os'
import process from 'node:process'
import spawn from 'cross-spawn'
import { pushCommandEnvironment } from '../environment'
import { stopPushProcessTree } from './process-tree'

export { PushProcessCleanupError } from './process-tree'

export class PushCommandFailure extends Error {
  constructor(message: string, readonly exitCode: number) {
    super(message)
  }
}

function interruption(signal: AbortSignal) {
  const name = signal.reason === 'SIGINT' ? 'SIGINT' : 'SIGTERM'
  return new PushCommandFailure(`Pre-push verification interrupted by ${name}.`, 128 + constants.signals[name])
}

export function assertPushActive(signal: AbortSignal) {
  if (signal.aborted) {
    throw interruption(signal)
  }
}

/** Settle only after the child and its owned process tree have stopped. */
export async function runPushCommand(
  command: string,
  args: string[],
  cwd: string,
  environment: NodeJS.ProcessEnv,
  signal: AbortSignal,
  override?: typeof spawnSync,
) {
  assertPushActive(signal)
  const env = pushCommandEnvironment(environment, cwd)
  if (override) {
    const result = override(command, args, { cwd, env, stdio: 'inherit' })
    assertPushActive(signal)
    if (result.error || result.status !== 0) {
      throw new PushCommandFailure(result.error?.message ?? `${command} exited with ${result.status ?? result.signal ?? 'an error'}.`, result.status ?? 1)
    }
    return
  }
  const child = spawn(command, args, { cwd, env, stdio: 'inherit', detached: process.platform !== 'win32' })
  let failure: Error | undefined
  let cleanup: Promise<Error | undefined> | undefined
  const closed = new Promise<{ status: number | null, childSignal: NodeJS.Signals | null }>((resolve) => {
    child.once('error', (error) => {
      failure = error
    })
    child.once('close', (status, childSignal) => resolve({ status, childSignal }))
  })
  let reportCleanupFailure: (error: { cleanupFailure: Error }) => void = () => {}
  const cleanupFailed = new Promise<{ cleanupFailure: Error }>((resolve) => {
    reportCleanupFailure = resolve
  })
  const terminate = () => {
    if (child.pid && !cleanup) {
      // Attach rejection handling immediately: a cleanup failure may precede
      // the child's close event and must never become an unhandled rejection.
      cleanup = stopPushProcessTree(child.pid, signal.reason === 'SIGINT' ? 'SIGINT' : 'SIGTERM')
        .then(() => undefined, (error: Error) => {
          reportCleanupFailure({ cleanupFailure: error })
          return error
        })
    }
  }
  signal.addEventListener('abort', terminate, { once: true })
  if (signal.aborted) {
    terminate()
  }
  try {
    const result = await Promise.race([closed, cleanupFailed])
    if ('cleanupFailure' in result) {
      // The caller will retain the clone and report the owned PID. Do not hang
      // indefinitely awaiting a process that the OS refused to terminate.
      child.unref()
      throw result.cleanupFailure
    }
    const { status, childSignal } = result
    // A successful POSIX command can still leave background children in its
    // detached process group, so clean that group after the leader closes. On
    // Windows taskkill needs the root PID to still exist; after a natural
    // close the OS gives us no safe way to reconstruct descendants, so the
    // exact PID-tree cleanup is reserved for aborts while the root is alive.
    if (process.platform !== 'win32') {
      terminate()
    }
    const cleanupFailure = await cleanup
    if (cleanupFailure) {
      throw cleanupFailure
    }
    assertPushActive(signal)
    if (failure || status !== 0) {
      const exitCode = failure ? 1 : status ?? (childSignal ? 128 + constants.signals[childSignal] : 1)
      throw new PushCommandFailure(failure?.message ?? `${command} exited with ${status ?? childSignal}.`, exitCode)
    }
  }
  finally {
    signal.removeEventListener('abort', terminate)
  }
}
