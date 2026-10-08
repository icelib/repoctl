import type { SyncContext } from './types'

export const sourceRegistry = 'https://registry.npmjs.org'
export const mirrorRegistry = 'https://registry.npmmirror.com'
export const syncRegistry = 'https://registry-direct.npmmirror.com'

export class MirrorHttpError extends Error {
  constructor(readonly status: number, readonly url: string, message: string) {
    super(message)
  }
}

export function remaining(context: SyncContext) {
  const milliseconds = context.deadline - context.now()
  if (milliseconds <= 0) {
    throw new Error('npmmirror sync timed out')
  }
  return milliseconds
}

export async function pause(context: SyncContext, milliseconds: number) {
  await context.sleep(Math.min(milliseconds, remaining(context)))
  remaining(context)
}

function retryDelay(response: Response, attempt: number) {
  const header = response.headers.get('retry-after')
  if (header !== null) {
    const seconds = Number(header)
    const milliseconds = Number.isFinite(seconds)
      ? seconds * 1000
      : Date.parse(header) - Date.now()
    if (Number.isFinite(milliseconds) && milliseconds >= 0) {
      return milliseconds
    }
  }
  return (attempt + 1) * 1000
}

/** 所有请求、响应读取和重试共用本次同步的截止时间。 */
export async function requestJson(url: string, context: SyncContext, init: RequestInit = {}): Promise<unknown> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const signal = AbortSignal.timeout(Math.max(1, Math.ceil(Math.min(10_000, remaining(context)))))
    let response: Response
    let body: string
    try {
      response = await context.fetch(url, {
        ...init,
        headers: { accept: 'application/json', ...init.headers },
        signal,
      })
      body = await response.text()
    }
    catch (error) {
      if (attempt === 2) {
        throw new Error(`npmmirror request failed: ${error instanceof Error ? error.message : String(error)}`)
      }
      await pause(context, (attempt + 1) * 1000)
      continue
    }

    if (!response.ok) {
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        await pause(context, retryDelay(response, attempt))
        continue
      }
      throw new MirrorHttpError(response.status, url, `HTTP ${response.status}: ${body.slice(0, 500)}`)
    }
    remaining(context)
    try {
      return JSON.parse(body)
    }
    catch {
      throw new Error(`Invalid JSON response from ${url}`)
    }
  }
  throw new Error('npmmirror request exhausted retries')
}

export function validatePackageName(name: string) {
  if (name.length > 214 || !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u.test(name)) {
    throw new Error(`Invalid npm package name: ${name}`)
  }
}

/** 包名整体编码，scoped 包的斜线仍属于同一个路由参数。 */
export function taskEndpoint(name: string) {
  validatePackageName(name)
  return `${syncRegistry}/-/package/${encodeURIComponent(name)}/syncs`
}
