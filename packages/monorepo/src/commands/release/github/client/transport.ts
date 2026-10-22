import type { GitHubClientOptions } from '../types'
import process from 'node:process'
import { GitHubApiError } from '../errors'

/** Shared authenticated transport; mutation callers own reconciliation. */
export class GitHubTransport {
  private readonly token: string | undefined
  private readonly repository: string | undefined
  private readonly apiUrl: string
  private readonly requestFetch: typeof fetch
  protected readonly retryAttempts: number
  protected readonly retryDelay: number
  protected readonly sleep: (milliseconds: number) => Promise<void>

  constructor(options: GitHubClientOptions = {}) {
    this.token = options.token ?? process.env['GITHUB_TOKEN']
    this.repository = options.repository ?? process.env['GITHUB_REPOSITORY']
    this.apiUrl = (options.apiUrl ?? process.env['GITHUB_API_URL'] ?? 'https://api.github.com').replace(/\/$/, '')
    this.requestFetch = options.fetch ?? globalThis.fetch
    this.retryAttempts = Math.max(1, options.retryAttempts ?? 4)
    this.retryDelay = Math.max(0, options.retryDelay ?? 1_000)
    this.sleep = options.sleep ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)))
  }

  protected getRepository() {
    if (!this.token) {
      throw new GitHubApiError('GITHUB_TOKEN is required for GitHub release orchestration', 0)
    }
    if (!this.repository || !/^[^/]+\/[^/]+$/.test(this.repository)) {
      throw new GitHubApiError('GITHUB_REPOSITORY must be in owner/name format', 0)
    }
    return this.repository
  }

  protected async request<T>(method: string, endpoint: string, body?: unknown): Promise<{ status: number, data: T | undefined }> {
    const repository = this.getRepository()
    for (let attempt = 1; attempt <= this.retryAttempts; attempt += 1) {
      let response: Response
      try {
        response = await this.requestFetch(`${this.apiUrl}/repos/${repository}${endpoint}`, {
          method,
          signal: AbortSignal.timeout(30_000),
          headers: {
            'Accept': 'application/vnd.github+json',
            'Authorization': `Bearer ${this.token}`,
            'X-GitHub-Api-Version': '2022-11-28',
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        })
      }
      catch (error) {
        // A mutating request may have been accepted even when the transport
        // fails before returning a response. Let the caller reconcile it
        // before issuing another POST.
        if (method !== 'POST' && method !== 'PUT' && attempt < this.retryAttempts) {
          await this.sleep(this.retryDelay * 2 ** (attempt - 1))
          continue
        }
        const detail = error instanceof Error ? error.message : String(error)
        throw new GitHubApiError(`GitHub API request ${method} ${endpoint} failed: ${detail}. Check network access and GITHUB_API_URL.`, 0)
      }
      let text: string
      try {
        text = await response.text()
      }
      catch (error) {
        // The server may have committed a POST before the response stream
        // was interrupted. Reconcile by the resource's idempotency key first.
        if (method !== 'POST' && method !== 'PUT' && attempt < this.retryAttempts) {
          await this.sleep(this.retryDelay * 2 ** (attempt - 1))
          continue
        }
        const detail = error instanceof Error ? error.message : String(error)
        throw new GitHubApiError(`GitHub API response ${method} ${endpoint} was interrupted: ${detail}`, 0)
      }
      let data: T | undefined
      if (text) {
        try {
          data = JSON.parse(text) as T
        }
        catch {
          if (method !== 'POST' && method !== 'PUT' && attempt < this.retryAttempts) {
            await this.sleep(this.retryDelay * 2 ** (attempt - 1))
            continue
          }
          throw new GitHubApiError(`GitHub API returned invalid JSON for ${method} ${endpoint}`, method === 'POST' || method === 'PUT' ? 0 : response.status, text)
        }
      }
      if (!response.ok) {
        const message = typeof data === 'object' && data !== null && 'message' in data
          ? String((data as { message: unknown }).message)
          : text || response.statusText
        if (method !== 'POST' && method !== 'PUT' && (response.status === 429 || response.status >= 500) && attempt < this.retryAttempts) {
          const retryAfter = response.headers.get('retry-after')
          const reset = response.headers.get('x-ratelimit-reset')
          const retrySeconds = retryAfter && /^\d+(?:\.\d+)?$/.test(retryAfter)
            ? Number(retryAfter)
            : retryAfter ? Math.max(0, (Date.parse(retryAfter) - Date.now()) / 1000) : 0
          const resetSeconds = reset && /^\d+$/.test(reset) ? Math.max(0, Number(reset) - Date.now() / 1000) : 0
          const delay = Math.max(this.retryDelay * 2 ** (attempt - 1), retrySeconds * 1000, resetSeconds * 1000)
          await this.sleep(Math.min(delay, 30_000))
          continue
        }
        throw new GitHubApiError(`GitHub API ${method} ${endpoint} failed (${response.status}): ${message}`, response.status, text)
      }
      return { status: response.status, data }
    }
    throw new GitHubApiError(`GitHub API request ${method} ${endpoint} exhausted retries`, 0)
  }
}
