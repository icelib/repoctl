import type { ReleaseNoteDocument } from '../notes/model'
import type {
  CloseLegacyPullRequestsOptions,
  EnsurePullRequestOptions,
  EnsureReleaseOptions,
  EnsureTagOptions,
  GitHubClientOptions,
  GitHubOperations,
  GitHubPullRequest,
  GitHubRelease,
  GitHubRequest,
  UpdateReleaseOptions,
} from './types'
import process from 'node:process'
import { logger } from '../../../core/logger'
import { ReleaseCommandError } from '../errors'
import { enrichReleaseNote, readReleasePullRequestContributors } from './metadata'

export class GitHubApiError extends ReleaseCommandError {
  constructor(message: string, public readonly status: number, public readonly responseBody?: string) {
    super(message)
    this.name = 'GitHubApiError'
  }
}

export class GitHubClient implements GitHubOperations {
  private readonly token: string | undefined
  private readonly repository: string | undefined
  private readonly apiUrl: string
  private readonly requestFetch: typeof fetch
  private readonly retryAttempts: number
  private readonly retryDelay: number
  private readonly sleep: (milliseconds: number) => Promise<void>

  constructor(options: GitHubClientOptions = {}) {
    this.token = options.token ?? process.env['GITHUB_TOKEN']
    this.repository = options.repository ?? process.env['GITHUB_REPOSITORY']
    this.apiUrl = (options.apiUrl ?? process.env['GITHUB_API_URL'] ?? 'https://api.github.com').replace(/\/$/, '')
    this.requestFetch = options.fetch ?? globalThis.fetch
    this.retryAttempts = Math.max(1, options.retryAttempts ?? 4)
    this.retryDelay = Math.max(0, options.retryDelay ?? 1_000)
    this.sleep = options.sleep ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)))
  }

  private getRepository() {
    if (!this.token) {
      throw new GitHubApiError('GITHUB_TOKEN is required for GitHub release orchestration', 0)
    }
    if (!this.repository || !/^[^/]+\/[^/]+$/.test(this.repository)) {
      throw new GitHubApiError('GITHUB_REPOSITORY must be in owner/name format', 0)
    }
    return this.repository
  }

  private async request<T>(method: string, endpoint: string, body?: unknown): Promise<{ status: number, data: T | undefined }> {
    const repository = this.getRepository()
    for (let attempt = 1; attempt <= this.retryAttempts; attempt += 1) {
      let response: Response
      try {
        response = await this.requestFetch(`${this.apiUrl}/repos/${repository}${endpoint}`, {
          method,
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
        if (attempt < this.retryAttempts) {
          await this.sleep(this.retryDelay * 2 ** (attempt - 1))
          continue
        }
        const detail = error instanceof Error ? error.message : String(error)
        throw new GitHubApiError(`GitHub API request ${method} ${endpoint} failed: ${detail}. Check network access and GITHUB_API_URL.`, 0)
      }
      const text = await response.text()
      let data: T | undefined
      if (text) {
        try {
          data = JSON.parse(text) as T
        }
        catch {
          if (attempt < this.retryAttempts) {
            await this.sleep(this.retryDelay * 2 ** (attempt - 1))
            continue
          }
          throw new GitHubApiError(`GitHub API returned invalid JSON for ${method} ${endpoint}`, response.status, text)
        }
      }
      if (!response.ok) {
        const message = typeof data === 'object' && data !== null && 'message' in data
          ? String((data as { message: unknown }).message)
          : text || response.statusText
        if ((response.status === 429 || response.status >= 500) && attempt < this.retryAttempts) {
          const retryAfter = response.headers.get('retry-after')
          const reset = response.headers.get('x-ratelimit-reset')
          const retrySeconds = retryAfter && /^\d+(?:\.\d+)?$/.test(retryAfter)
            ? Number(retryAfter)
            : retryAfter ? Math.max(0, (Date.parse(retryAfter) - Date.now()) / 1000) : 0
          const resetSeconds = reset && /^\d+$/.test(reset) ? Math.max(0, Number(reset) - Date.now() / 1000) : 0
          const delay = Math.max(this.retryDelay * 2 ** (attempt - 1), retrySeconds * 1000, resetSeconds * 1000)
          await this.sleep(delay)
          continue
        }
        throw new GitHubApiError(`GitHub API ${method} ${endpoint} failed (${response.status}): ${message}`, response.status, text)
      }
      return { status: response.status, data }
    }
    throw new GitHubApiError(`GitHub API request ${method} ${endpoint} exhausted retries`, 0)
  }

  private getRequest(): GitHubRequest {
    return this.request.bind(this)
  }

  async ensurePullRequest(options: EnsurePullRequestOptions) {
    const repository = this.getRepository()
    const [owner] = repository.split('/')
    const head = options.head.includes(':') ? options.head : `${owner}:${options.head}`
    const query = new URLSearchParams({ state: 'open', head, base: options.base, per_page: '10' })
    const listed = await this.request<GitHubPullRequest[]>('GET', `/pulls?${query.toString()}`)
    const existing = listed.data?.[0]
    if (existing) {
      await this.request<GitHubPullRequest>('PATCH', `/pulls/${existing.number}`, { title: options.title, body: options.body, base: options.base })
      return existing
    }
    try {
      const created = await this.request<GitHubPullRequest>('POST', '/pulls', { title: options.title, body: options.body, head: options.head, base: options.base })
      if (!created.data) {
        throw new GitHubApiError('GitHub did not return the created pull request', created.status)
      }
      return created.data
    }
    catch (error) {
      if (!(error instanceof GitHubApiError) || (![0, 429, 500, 502, 503, 504, 505, 506, 507, 508, 509, 510, 511].includes(error.status) && error.status !== 422)) {
        throw error
      }
      const recovered = await this.request<GitHubPullRequest[]>('GET', `/pulls?${query.toString()}`)
      if (recovered.data?.[0]) {
        return recovered.data[0]
      }
      throw error
    }
  }

  async closeLegacyReleasePullRequests(options: CloseLegacyPullRequestsOptions) {
    const repository = this.getRepository()
    const [owner] = repository.split('/')
    const head = options.head.includes(':') ? options.head : `${owner}:${options.head}`
    const query = new URLSearchParams({ state: 'open', head, base: options.base, per_page: '100' })
    const listed = await this.request<GitHubPullRequest[]>('GET', `/pulls?${query.toString()}`)
    for (const pullRequest of listed.data ?? []) {
      const isLegacyRelease = pullRequest.head?.ref === options.head && (pullRequest.title === 'Version Packages' || pullRequest.body?.includes('changesets/action') === true)
      if (isLegacyRelease) {
        await this.request<GitHubPullRequest>('PATCH', `/pulls/${pullRequest.number}`, { state: 'closed' })
      }
    }
  }

  async ensureRelease(options: EnsureReleaseOptions) {
    let existing: GitHubRelease | undefined
    try {
      existing = (await this.request<GitHubRelease>('GET', `/releases/tags/${encodeURIComponent(options.tag)}`)).data
    }
    catch (error) {
      if (!(error instanceof GitHubApiError) || error.status !== 404) {
        throw error
      }
    }
    if (existing) {
      if (options.body !== undefined || options.name !== undefined) {
        const updated = await this.request<GitHubRelease>('PATCH', `/releases/${existing.id}`, {
          ...(options.name === undefined ? {} : { name: options.name }),
          ...(options.body === undefined ? {} : { body: options.body }),
          prerelease: options.prerelease ?? false,
        })
        return updated.data ?? existing
      }
      return existing
    }
    try {
      const created = await this.request<GitHubRelease>('POST', '/releases', {
        tag_name: options.tag,
        target_commitish: options.target,
        name: options.name ?? options.tag,
        ...(options.body === undefined ? { generate_release_notes: true } : { body: options.body }),
        prerelease: options.prerelease ?? false,
      })
      if (!created.data) {
        throw new GitHubApiError('GitHub did not return the created release', created.status)
      }
      return created.data
    }
    catch (error) {
      if (!(error instanceof GitHubApiError) || (![0, 429, 500, 502, 503, 504, 505, 506, 507, 508, 509, 510, 511].includes(error.status) && error.status !== 422)) {
        throw error
      }
      const recovered = await this.request<GitHubRelease>('GET', `/releases/tags/${encodeURIComponent(options.tag)}`)
      if (!recovered.data) {
        throw error
      }
      return recovered.data
    }
  }

  async listReleases() {
    const releases: GitHubRelease[] = []
    for (let page = 1; ; page++) {
      const response = await this.request<GitHubRelease[]>('GET', `/releases?per_page=100&page=${page}`)
      const pageReleases = response.data ?? []
      releases.push(...pageReleases)
      if (pageReleases.length < 100) {
        break
      }
    }
    return releases
  }

  async updateRelease(options: UpdateReleaseOptions) {
    const response = await this.request<GitHubRelease>('PATCH', `/releases/${options.id}`, {
      name: options.name,
      body: options.body,
    })
    if (!response.data) {
      throw new GitHubApiError(`GitHub did not return release ${options.id} after update`, response.status)
    }
    return response.data
  }

  async enrichReleaseNote(document: ReleaseNoteDocument) {
    try {
      return await enrichReleaseNote(this.getRequest(), document)
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.warn(`GitHub release note metadata enrichment skipped: ${message}`)
      return document
    }
  }

  async readReleasePullRequestContributors(target: string) {
    return readReleasePullRequestContributors(this.getRequest(), target)
  }

  async ensureTag(options: EnsureTagOptions) {
    const endpoint = `/git/ref/tags/${encodeURIComponent(options.tag)}`
    try {
      await this.request('GET', endpoint)
      return
    }
    catch (error) {
      if (!(error instanceof GitHubApiError) || error.status !== 404) {
        throw error
      }
    }
    try {
      await this.request('POST', '/git/refs', { ref: `refs/tags/${options.tag}`, sha: options.target })
    }
    catch (error) {
      if (!(error instanceof GitHubApiError) || error.status !== 422) {
        throw error
      }
      await this.request('GET', endpoint)
    }
  }
}
