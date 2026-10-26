import type { PreparedSnapshotConsumerOptions } from './types'
import { performance } from 'node:perf_hooks'
import { registrySettings } from '../../../registry/settings'

export function snapshotConsumerBudget(options: PreparedSnapshotConsumerOptions) {
  const started = performance.now()
  const timeout = Math.min(900_000, registrySettings({ ...options, cwd: options.outputDirectory }).visibilityTimeoutMs)
  let virtualWait = 0
  const remaining = () => Math.max(0, timeout - (performance.now() - started + virtualWait))
  return {
    remaining,
    wait: async (delay: number) => {
      const duration = Math.min(delay, remaining())
      const before = performance.now()
      await (options.sleep?.(duration) ?? new Promise<void>(resolve => setTimeout(resolve, duration)))
      virtualWait += Math.max(0, duration - (performance.now() - before))
    },
  }
}

export type SnapshotConsumerBudget = ReturnType<typeof snapshotConsumerBudget>

export async function retrySnapshotVisibility<T>(task: (attempt: number) => Promise<T>, retryable: (error: unknown) => boolean, budget: SnapshotConsumerBudget): Promise<T> {
  let lastFailure: unknown
  for (let attempt = 0; budget.remaining() >= 1; attempt++) {
    try {
      return await task(attempt)
    }
    catch (error) {
      if (!retryable(error)) {
        throw error
      }
      lastFailure = error
    }
    await budget.wait(Math.min(2000 * 2 ** Math.min(attempt, 4), 30_000))
  }
  throw new Error('Snapshot consumer registry visibility timed out; confirmed packages were not uploaded again.', { cause: lastFailure })
}
