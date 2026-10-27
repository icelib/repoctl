import type { ReleaseLifecycleState } from '../lifecycle/types'
import type { ReleaseNoteDocument } from '../notes/model'
import type {
  CloseLegacyPullRequestsOptions,
  EnsurePullRequestOptions,
  EnsureReleaseOptions,
  EnsureTagOptions,
  GitHubOperations,
  GitHubPullRequest,
  GitHubRelease,
  GitHubRequest,
  UpdateReleaseOptions,
} from './types'
import { logger } from '../../../core/logger'
import { GitHubTransport } from './client/transport'
import { GitHubApiError } from './errors'
import { enrichReleaseNote, readReleasePullRequestContributors } from './metadata'
import { readAutomationState, readReleaseState, writeAutomationState, writeReleaseState } from './state'
import { ensureTag, readBranchHead, readTagTarget } from './tags'

export { GitHubApiError } from './errors'

export class GitHubClient extends GitHubTransport implements GitHubOperations {
  private getRequest(): GitHubRequest {
    return this.request.bind(this)
  }

  async readReleaseState(key: string) {
    return readReleaseState(this.getRequest(), key)
  }

  async readAutomationState(key: string) {
    return readAutomationState(this.getRequest(), key)
  }

  async writeAutomationState(key: string, value: unknown, revision?: string) {
    return writeAutomationState(this.getRequest(), key, value, revision, {
      retryAttempts: this.retryAttempts,
      retryDelay: this.retryDelay,
      sleep: this.sleep,
    })
  }

  async writeReleaseState(key: string, state: ReleaseLifecycleState, revision?: string) {
    return writeReleaseState(this.getRequest(), key, state, revision, {
      retryAttempts: this.retryAttempts,
      retryDelay: this.retryDelay,
      sleep: this.sleep,
    })
  }

  async ensurePullRequest(options: EnsurePullRequestOptions) {
    const repository = this.getRepository()
    const [owner] = repository.split('/')
    const head = options.head.includes(':') ? options.head : `${owner}:${options.head}`
    const query = new URLSearchParams({ state: 'open', head, base: options.base, per_page: '10' })
    const listed = await this.request<GitHubPullRequest[]>('GET', `/pulls?${query.toString()}`)
    const existing = listed.data?.[0]
    if (existing) {
      if (existing.title !== options.title || (existing.body ?? '') !== options.body) {
        await this.request<GitHubPullRequest>('PATCH', `/pulls/${existing.number}`, { title: options.title, body: options.body })
      }
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
          draft: false,
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

  /** 只按准确 tag 读取，分页集合不能证明某个已知版本不存在。 */
  async readRelease(tag: string): Promise<GitHubRelease | undefined> {
    let response
    try {
      response = await this.request<GitHubRelease>('GET', `/releases/tags/${encodeURIComponent(tag)}`)
    }
    catch (error) {
      if (error instanceof GitHubApiError && error.status === 404) {
        return undefined
      }
      throw error
    }
    const data = response.data
    if (!data || Array.isArray(data) || typeof data !== 'object'
      || !Number.isSafeInteger(data.id) || data.id <= 0 || typeof data.html_url !== 'string'
      || data.tag_name !== tag || typeof data.draft !== 'boolean' || typeof data.prerelease !== 'boolean') {
      throw new GitHubApiError(`GitHub returned invalid release response for ${tag}; release state is unknown`, response.status)
    }
    return data
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

  async readTagTarget(tag: string) {
    return readTagTarget(this.getRequest(), tag)
  }

  async readBranchHead(branch: string) {
    return readBranchHead(this.getRequest(), branch)
  }

  async ensureTag(options: EnsureTagOptions) {
    return ensureTag(this.getRequest(), options)
  }
}
