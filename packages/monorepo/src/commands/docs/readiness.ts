import type { DocsDeploymentTarget } from '../../types/docs'
import type { DocsDeploymentPlan } from './types'
import { Buffer } from 'node:buffer'
import { performance } from 'node:perf_hooks'
import { DocsDiagnosticError } from './diagnostics'
import { docsManifest, docsManifestPath } from './manifest'

export type DocsReadinessReason = 'identity-mismatch' | 'invalid-payload' | 'invalid-json' | 'response-too-large' | 'http-status' | 'network-error' | 'request-timeout'

export class DocsReadinessError extends Error {
  constructor(readonly reason: DocsReadinessReason, readonly attempts: number) {
    super(`Documentation readiness budget exhausted (${reason})`)
    this.name = 'DocsReadinessError'
  }
}

export function readinessUrl(target: DocsDeploymentTarget) {
  let url: URL
  try {
    url = new URL(target.url ?? '')
  }
  catch {
    throw new DocsDiagnosticError('readiness-url-invalid')
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new DocsDiagnosticError('readiness-url-invalid')
  }
  return new URL(`/${docsManifestPath}`, url).href
}

function matches(value: unknown, plan: DocsDeploymentPlan) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  return Object.entries(docsManifest(plan)).every(([key, expected]) => Reflect.get(value, key) === expected)
    && (plan.releaseId !== undefined || !Object.hasOwn(value, 'releaseId'))
}

async function readBody(response: Response, signal: AbortSignal): Promise<unknown> {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new DocsReadinessError('invalid-payload', 0)
  }
  const chunks: Uint8Array[] = []
  let bytes = 0
  const cancel = () => {
    void reader.cancel().catch(() => {})
  }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) {
        break
      }
      bytes += chunk.value.byteLength
      if (bytes > 65_536) {
        void reader.cancel().catch(() => {})
        throw new DocsReadinessError('response-too-large', 0)
      }
      chunks.push(chunk.value)
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'))
    }
    catch {
      throw new DocsReadinessError('invalid-json', 0)
    }
  }
  finally {
    signal.removeEventListener('abort', cancel)
    reader.releaseLock()
  }
}

async function probe(url: string, plan: DocsDeploymentPlan, request: typeof fetch, timeoutMs: number): Promise<DocsReadinessReason | undefined> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<DocsReadinessReason>((resolve) => {
    timer = setTimeout(() => {
      controller.abort()
      resolve('request-timeout')
    }, timeoutMs)
  })
  const operation = async (): Promise<DocsReadinessReason | undefined> => {
    try {
      const response = await request(url, {
        method: 'GET',
        redirect: 'error',
        credentials: 'omit',
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store', 'Pragma': 'no-cache', 'Accept': 'application/json' },
        signal: controller.signal,
      })
      if (controller.signal.aborted) {
        void response.body?.cancel().catch(() => {})
        return 'request-timeout'
      }
      if (response.status !== 200) {
        void response.body?.cancel().catch(() => {})
        return 'http-status'
      }
      const value = await readBody(response, controller.signal)
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return 'invalid-payload'
      }
      return matches(value, plan) ? undefined : 'identity-mismatch'
    }
    catch (error) {
      return controller.signal.aborted ? 'request-timeout' : error instanceof DocsReadinessError ? error.reason : 'network-error'
    }
  }
  try {
    // Race the complete operation, including body consumption and custom transports.
    return await Promise.race([operation(), timeout])
  }
  finally {
    clearTimeout(timer)
    controller.abort()
  }
}

/** A fresh finite budget for each invocation; provider credentials are never sent publicly. */
export async function verifyDocsReadiness(target: DocsDeploymentTarget, plan: DocsDeploymentPlan, request: typeof fetch = fetch, now: () => number = () => performance.now()) {
  const url = readinessUrl(target)
  const timeoutMs = target.readiness?.timeoutMs ?? 120_000
  const requestTimeoutMs = target.readiness?.requestTimeoutMs ?? 10_000
  const deadline = now() + timeoutMs
  let attempts = 0
  let reason: DocsReadinessReason = 'request-timeout'
  while (now() < deadline) {
    attempts++
    const result = await probe(url, plan, request, Math.min(requestTimeoutMs, Math.max(1, deadline - now())))
    if (result === undefined && now() <= deadline) {
      return
    }
    reason = result ?? 'request-timeout'
    const remaining = deadline - now()
    if (remaining <= 0) {
      break
    }
    await new Promise(resolve => setTimeout(resolve, Math.min(remaining, Math.min(5_000, 1_000 * 2 ** Math.min(attempts - 1, 3)))))
  }
  throw new DocsReadinessError(reason, attempts)
}
