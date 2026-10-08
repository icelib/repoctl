import type { NpmMirrorSyncOptions, SyncContext, SyncResult, SyncRuntime } from './types'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { setTimeout } from 'node:timers/promises'
import { MirrorHttpError, sourceRegistry } from './http'
import { syncTarget } from './sync'
import { selectTargets, validateOptions } from './targets'

/** 同步结果逐包汇总；镜像失败由调用方决定是否阻断发布。 */
export async function syncNpmMirror(options: NpmMirrorSyncOptions, runtime: Partial<SyncRuntime> = {}): Promise<SyncResult[]> {
  const timeout = validateOptions(options)
  const now = runtime.now ?? (() => performance.now())
  const context: SyncContext = {
    now,
    fetch: runtime.fetch ?? globalThis.fetch,
    sleep: runtime.sleep ?? (async (milliseconds) => { await setTimeout(milliseconds) }),
    deadline: now() + timeout * 1000,
  }
  const targets = await selectTargets({ ...options, env: options.env ?? process.env })
  const results: SyncResult[] = targets.map(target => ({ ...target, state: 'failed' }))
  let cursor = 0
  async function worker() {
    while (cursor < targets.length) {
      const index = cursor++
      const target = targets[index]!
      const result = results[index]!
      try {
        await syncTarget(target, context, options.dryRun === true, result)
      }
      catch (error) {
        result.error = error instanceof Error ? error.message : String(error)
        if (options.all && error instanceof MirrorHttpError && error.status === 404
          && error.url === `${sourceRegistry}/${encodeURIComponent(target.name)}`) {
          result.state = 'skipped'
          result.error = 'Not yet published on public npm'
        }
      }
    }
  }
  await Promise.all([worker(), worker()])
  return results
}
