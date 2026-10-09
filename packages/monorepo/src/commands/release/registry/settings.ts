import type { ReleaseOptions } from '../types'
import { resolveCommandValues } from '../../../core/config/resolution'

export function registrySettings(options: ReleaseOptions) {
  const config = resolveCommandValues('release', options.config).values.registry!
  return { concurrency: config.concurrency!, requestTimeoutMs: config.requestTimeoutMs!, visibilityTimeoutMs: config.visibilityTimeoutMs! }
}

/** All workers and their retries consume the same deadline. */
export async function mapConcurrent<T, R>(items: T[], concurrency: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  let next = 0
  let failure: unknown
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length && !failure) {
      const index = next++
      try {
        results[index] = await task(items[index]!)
      }
      catch (error) {
        failure = error
      }
    }
  }))
  if (failure) {
    throw failure
  }
  return results
}
