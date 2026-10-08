import type { SyncRuntime } from '../../../../src/commands/release/npmmirror/types'
import { vi } from 'vitest'

export const packument = {
  'versions': { '1.0.0': {}, '2.0.0-next.0': {} },
  'dist-tags': { latest: '1.0.0', next: '2.0.0-next.0' },
}

export function harness(handler?: (url: string, init: RequestInit) => Response | Promise<Response>) {
  let elapsed = 0
  const fetch = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input)
    if (handler) {
      return handler(url, init)
    }
    if (url.includes('/syncs')) {
      return Response.json({ ok: true, id: 'task-1', state: 'success' })
    }
    return Response.json(packument)
  }) as ReturnType<typeof vi.fn<typeof globalThis.fetch>>
  const sleep = vi.fn(async (milliseconds: number) => {
    elapsed += milliseconds
  })
  const runtime: SyncRuntime = { fetch, sleep, now: () => elapsed }
  return { runtime, fetch, sleep, elapsed: () => elapsed }
}
