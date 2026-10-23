import type { TestContext } from 'vitest'
import process from 'node:process'
import { execa } from 'execa'

/** Keep real compiler processes within the fixture's lifetime, including test cancellation. */
export function consumer(t: TestContext, cwd: string) {
  let stage = 'setup'
  const completed: string[] = []
  const pending = new Set<PromiseLike<unknown>>()
  t.onTestFailed(() => {
    process.stderr.write(`Project references consumer failed during ${stage}; completed: ${completed.join(', ') || 'none'}\n`)
  })
  // Registered after fixture cleanup so the default stack order settles children first.
  t.onTestFinished(async () => {
    await Promise.allSettled(pending)
  })

  async function step<T>(name: string, run: () => Promise<T>) {
    stage = name
    const started = Date.now()
    const result = await run()
    completed.push(`${name} (${Date.now() - started}ms)`)
    return result
  }

  async function run(name: string, executable: string, args: string[], reject = true) {
    return step(name, async () => {
      const child = execa(executable, args, {
        cwd,
        reject,
        stdin: 'ignore',
        cancelSignal: t.signal,
        killDescendants: true,
        timeout: 30_000,
        forceKillAfterDelay: 1_000,
      })
      pending.add(child)
      try {
        return await child
      }
      finally {
        pending.delete(child)
      }
    })
  }

  return { step, run }
}
