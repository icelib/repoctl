import type { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { assertPushActive, PushProcessCleanupError, runPushCommand } from './commands'

/** A separate clone keeps checkout, config, index, hooks and refs task-owned. */
export async function withPushSnapshot(
  sourceRoot: string,
  commit: string,
  environment: NodeJS.ProcessEnv,
  signal: AbortSignal,
  execFile: typeof execFileSync,
  verify: (snapshotRoot: string) => Promise<void>,
) {
  const temporaryRoot = await realpath(await mkdtemp(path.join(tmpdir(), 'repoctl-push-')))
  const snapshotRoot = path.join(temporaryRoot, 'repository')
  let failure: unknown
  const git = (args: string[]) => runPushCommand('git', ['-c', 'core.hooksPath=', ...args], temporaryRoot, environment, signal)
  try {
    await git(['clone', '--quiet', '--no-checkout', '--shared', '--no-hardlinks', '--config', 'core.hooksPath=', '--', sourceRoot, snapshotRoot])
    await git(['-C', snapshotRoot, 'checkout', '--quiet', '--detach', commit])
    if (existsSync(path.join(snapshotRoot, '.gitmodules'))) {
      // Preserve the source origin for relative submodule URLs. Submodules
      // are checked out at their recorded commits, never a moving branch.
      let origin: string | undefined
      try {
        origin = execFile('git', ['remote', 'get-url', 'origin'], { cwd: sourceRoot, env: environment, encoding: 'utf8', stdio: 'pipe' }).trim()
      }
      catch {
        // A repository without an origin can still use absolute module URLs.
      }
      if (origin) {
        await git(['-C', snapshotRoot, 'remote', 'set-url', 'origin', origin])
      }
      await git(['-C', snapshotRoot, 'submodule', 'update', '--init', '--recursive', '--checkout'])
    }
    assertPushActive(signal)
    await verify(snapshotRoot)
  }
  catch (error) {
    failure = error
  }
  if (failure instanceof PushProcessCleanupError) {
    throw new Error(`Could not stop pre-push processes; snapshot retained for review: ${temporaryRoot}`, { cause: failure })
  }
  let cleanupFailure: unknown
  try {
    await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  }
  catch (error) {
    cleanupFailure = error
  }
  if (cleanupFailure) {
    throw new AggregateError([...(failure === undefined ? [] : [failure]), cleanupFailure], `Could not remove pre-push snapshot: ${temporaryRoot}`)
  }
  if (failure !== undefined) {
    throw failure
  }
}
