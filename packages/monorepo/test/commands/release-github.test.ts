import { describe, expect, it, vi } from 'vitest'
import { GitHubClient } from '@/commands/release'

function response(body: unknown, status = 200, headers?: Record<string, string>) {
  return new Response(body === undefined ? '' : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

describe('GitHub release client', () => {
  it('retries when a response body is interrupted', async () => {
    const interrupted = { text: async () => {
      throw new TypeError('socket closed')
    } } as unknown as Response
    const requestFetch = vi.fn()
      .mockResolvedValueOnce(response(undefined, 404))
      .mockResolvedValueOnce(interrupted)
      .mockResolvedValueOnce(response({ id: 1, tag_name: 'repo@1.0.0' }, 201))
    const client = new GitHubClient({ token: 'token', repository: 'acme/repo', fetch: requestFetch, retryDelay: 0 })
    await expect(client.ensureRelease({ tag: 'repo@1.0.0', target: 'abc123' })).resolves.toMatchObject({ id: 1 })
    expect(requestFetch).toHaveBeenCalledTimes(3)
  })

  it('reconciles a release after an accepted POST response is interrupted', async () => {
    const interrupted = { text: async () => {
      throw new TypeError('socket closed')
    } } as unknown as Response
    const requestFetch = vi.fn()
      .mockResolvedValueOnce(response(undefined, 404))
      .mockResolvedValueOnce(interrupted)
      .mockResolvedValueOnce(response({ id: 9, tag_name: 'repo@1.0.0' }))
    const client = new GitHubClient({ token: 'token', repository: 'acme/repo', fetch: requestFetch, retryDelay: 0 })

    await expect(client.ensureRelease({ tag: 'repo@1.0.0', target: 'abc123' })).resolves.toMatchObject({ id: 9 })
    expect(requestFetch).toHaveBeenCalledTimes(3)
    expect(requestFetch.mock.calls[1]?.[1]).toMatchObject({ method: 'POST' })
    expect(requestFetch.mock.calls[2]?.[1]).toMatchObject({ method: 'GET' })
  })

  it('retries transient responses four times and honors Retry-After', async () => {
    const sleeps: number[] = []
    const requestFetch = vi.fn()
      .mockResolvedValueOnce(new Response('{', { status: 502 }))
      .mockResolvedValueOnce(response({ message: 'busy' }, 429, { 'retry-after': '2' }))
      .mockResolvedValueOnce(response({ message: 'busy' }, 503))
      .mockResolvedValueOnce(response({ id: 1, tag_name: 'repo@1.0.0' }))
    const client = new GitHubClient({
      token: 'token',
      repository: 'acme/repo',
      fetch: requestFetch,
      sleep: async (ms) => { sleeps.push(ms) },
      retryDelay: 10,
    })

    await client.ensureRelease({ tag: 'repo@1.0.0', target: 'abc123' })

    expect(requestFetch).toHaveBeenCalledTimes(4)
    expect(sleeps).toEqual([10, 2_000, 40])
  })

  it('creates a release pull request from the configured repository', async () => {
    const requestFetch = vi.fn()
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response({ number: 12, html_url: 'https://github.com/acme/repo/pull/12', state: 'open' }, 201))
    const client = new GitHubClient({
      token: 'token',
      repository: 'acme/repo',
      fetch: requestFetch,
    })

    await client.ensurePullRequest({
      head: 'release/pnpm-version',
      base: 'main',
      title: 'Release',
      body: 'Generated',
    })

    expect(requestFetch).toHaveBeenNthCalledWith(1, expect.stringContaining('/repos/acme/repo/pulls?'), expect.objectContaining({ method: 'GET' }))
    expect(requestFetch).toHaveBeenNthCalledWith(2, 'https://api.github.com/repos/acme/repo/pulls', expect.objectContaining({ method: 'POST' }))
    const request = requestFetch.mock.calls[1]?.[1] as RequestInit | undefined
    expect(JSON.parse(String(request?.body))).toMatchObject({ head: 'release/pnpm-version', base: 'main' })
  })

  it('updates an existing pull request instead of creating a duplicate', async () => {
    const requestFetch = vi.fn()
      .mockResolvedValueOnce(response([{ number: 7, html_url: 'https://github.com/acme/repo/pull/7', state: 'open' }]))
      .mockResolvedValueOnce(response({ number: 7, html_url: 'https://github.com/acme/repo/pull/7', state: 'open' }))
    const client = new GitHubClient({ token: 'token', repository: 'acme/repo', fetch: requestFetch })

    await client.ensurePullRequest({ head: 'release/pnpm-version', base: 'main', title: 'Updated', body: 'Body' })

    expect(requestFetch).toHaveBeenNthCalledWith(2, 'https://api.github.com/repos/acme/repo/pulls/7', expect.objectContaining({ method: 'PATCH' }))
    expect(requestFetch).toHaveBeenCalledTimes(2)
  })

  it('closes the old Changesets release pull request during migration', async () => {
    const requestFetch = vi.fn()
      .mockResolvedValueOnce(response([{
        number: 793,
        title: 'Version Packages',
        body: 'This PR was opened by the https://github.com/changesets/action GitHub action.',
        head: { ref: 'changeset-release/main' },
        html_url: 'https://github.com/acme/repo/pull/793',
        state: 'open',
      }]))
      .mockResolvedValueOnce(response({ number: 793, state: 'closed' }))
    const client = new GitHubClient({ token: 'token', repository: 'acme/repo', fetch: requestFetch })

    await client.closeLegacyReleasePullRequests({ head: 'changeset-release/main', base: 'main' })

    expect(requestFetch).toHaveBeenNthCalledWith(1, expect.stringContaining('/repos/acme/repo/pulls?'), expect.objectContaining({ method: 'GET' }))
    expect(requestFetch).toHaveBeenNthCalledWith(2, 'https://api.github.com/repos/acme/repo/pulls/793', expect.objectContaining({ method: 'PATCH' }))
    const request = requestFetch.mock.calls[1]?.[1] as RequestInit | undefined
    expect(JSON.parse(String(request?.body))).toEqual({ state: 'closed' })
  })

  it('does not close a custom pull request on the legacy branch', async () => {
    const requestFetch = vi.fn().mockResolvedValueOnce(response([{
      number: 14,
      title: 'Feature work',
      body: 'Unrelated change',
      head: { ref: 'changeset-release/main' },
      html_url: 'https://github.com/acme/repo/pull/14',
      state: 'open',
    }]))
    const client = new GitHubClient({ token: 'token', repository: 'acme/repo', fetch: requestFetch })

    await client.closeLegacyReleasePullRequests({ head: 'changeset-release/main', base: 'main' })

    expect(requestFetch).toHaveBeenCalledTimes(1)
  })

  it('creates a release after a missing tag release and recovers a concurrent create', async () => {
    const requestFetch = vi.fn()
      .mockResolvedValueOnce(response({ message: 'Not Found' }, 404))
      .mockResolvedValueOnce(response({ message: 'already exists' }, 422))
      .mockResolvedValueOnce(response({ id: 3, html_url: 'https://github.com/acme/repo/releases/3', tag_name: 'repo@1.0.0' }))
    const client = new GitHubClient({ token: 'token', repository: 'acme/repo', fetch: requestFetch })

    await client.ensureRelease({ tag: 'repo@1.0.0', target: 'abc123' })

    expect(requestFetch).toHaveBeenNthCalledWith(2, 'https://api.github.com/repos/acme/repo/releases', expect.objectContaining({ method: 'POST' }))
    expect(requestFetch).toHaveBeenNthCalledWith(3, 'https://api.github.com/repos/acme/repo/releases/tags/repo%401.0.0', expect.objectContaining({ method: 'GET' }))
  })

  it('creates and updates release notes idempotently', async () => {
    const createFetch = vi.fn()
      .mockResolvedValueOnce(response({ message: 'Not Found' }, 404))
      .mockResolvedValueOnce(response({ id: 5, html_url: 'https://github.com/acme/repo/releases/5', tag_name: 'repo@1.0.0' }, 201))
    const createClient = new GitHubClient({ token: 'token', repository: 'acme/repo', fetch: createFetch })

    await createClient.ensureRelease({ tag: 'repo@1.0.0', target: 'abc123', name: 'repo@1.0.0', body: '### Features' })

    const createRequest = createFetch.mock.calls[1]?.[1] as RequestInit | undefined
    expect(JSON.parse(String(createRequest?.body))).toMatchObject({ name: 'repo@1.0.0', body: '### Features' })
    expect(JSON.parse(String(createRequest?.body))).not.toHaveProperty('generate_release_notes')

    const updateFetch = vi.fn()
      .mockResolvedValueOnce(response({ id: 5, html_url: 'https://github.com/acme/repo/releases/5', tag_name: 'repo@1.0.0' }))
      .mockResolvedValueOnce(response({ id: 5, html_url: 'https://github.com/acme/repo/releases/5', tag_name: 'repo@1.0.0' }))
    const updateClient = new GitHubClient({ token: 'token', repository: 'acme/repo', fetch: updateFetch })

    await updateClient.ensureRelease({ tag: 'repo@1.0.0', target: 'abc123', body: 'Updated notes' })

    expect(updateFetch).toHaveBeenNthCalledWith(2, 'https://api.github.com/repos/acme/repo/releases/5', expect.objectContaining({ method: 'PATCH' }))
  })

  it('enriches contributors and falls back when metadata requests fail', async () => {
    const document = {
      packages: [{ name: 'repo', version: '1.0.0' }],
      entries: [{
        packageName: 'repo',
        version: '1.0.0',
        category: 'fixes' as const,
        summary: 'Fix #17.',
        commits: [{ sha: 'abc123', subject: 'fix: release (#42)' }],
        pullRequests: [42],
        issues: [17],
        authors: [],
      }],
      contributors: [],
      compareUrls: [],
    }
    const requestFetch = vi.fn()
      .mockResolvedValueOnce(response({ author: { login: 'alice' } }))
      .mockResolvedValueOnce(response({ user: { login: 'bob' } }))
      .mockResolvedValueOnce(response({ user: { login: 'carol' } }))
    const client = new GitHubClient({ token: 'token', repository: 'acme/repo', fetch: requestFetch })

    await expect(client.enrichReleaseNote(document)).resolves.toMatchObject({
      contributors: ['alice', 'bob', 'carol'],
      entries: [{ authors: ['alice', 'bob', 'carol'] }],
    })

    const fallbackClient = new GitHubClient({ token: 'token', repository: 'acme/repo', fetch: vi.fn().mockRejectedValue(new Error('offline')) })
    await expect(fallbackClient.enrichReleaseNote(document)).resolves.toEqual(document)
  })

  it('reads contributors from the merged release pull request for a target commit', async () => {
    const requestFetch = vi.fn().mockResolvedValueOnce(response([{
      number: 909,
      title: 'chore(release): version packages',
      body: '# Release Notes\n\n## ❤️ Contributors\n\nThanks to @alice · **@bob** · [@alice](https://github.com/alice)',
      html_url: 'https://github.com/acme/repo/pull/909',
      state: 'closed',
      merged_at: '2026-09-01T00:00:00Z',
    }]))
    const client = new GitHubClient({ token: 'token', repository: 'acme/repo', fetch: requestFetch })

    await expect(client.readReleasePullRequestContributors('abc123')).resolves.toEqual(['@alice', '@bob'])
    expect(requestFetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/acme/repo/commits/abc123/pulls',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('falls back cleanly when the target commit has no readable release pull request', async () => {
    const client = new GitHubClient({
      token: 'token',
      repository: 'acme/repo',
      fetch: vi.fn().mockRejectedValue(new Error('offline')),
    })

    await expect(client.readReleasePullRequestContributors('abc123')).resolves.toEqual([])
  })

  it('fails with an actionable error when token is missing', async () => {
    // The release workflow exports GITHUB_TOKEN for the whole CLI process.
    // Override it explicitly so this test remains isolated from CI runtime state.
    const client = new GitHubClient({ token: '', repository: 'acme/repo', fetch: vi.fn() })

    await expect(client.ensureRelease({ tag: 'repo@1.0.0', target: 'abc123' })).rejects.toMatchObject({
      message: expect.stringContaining('GITHUB_TOKEN'),
      status: 0,
    })
  })

  it('recovers a concurrent release PR creation', async () => {
    const requestFetch = vi.fn()
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response({ message: 'A pull request already exists' }, 422))
      .mockResolvedValueOnce(response([{ number: 19, html_url: 'https://github.com/acme/repo/pull/19', state: 'open' }]))
    const client = new GitHubClient({ token: 'token', repository: 'acme/repo', fetch: requestFetch })

    await expect(client.ensurePullRequest({
      head: 'release/pnpm-version',
      base: 'main',
      title: 'Release',
      body: 'Generated',
    })).resolves.toMatchObject({ number: 19 })
    expect(requestFetch).toHaveBeenCalledTimes(3)
  })

  it('wraps network failures with GitHub diagnostics', async () => {
    const client = new GitHubClient({
      token: 'token',
      repository: 'acme/repo',
      fetch: vi.fn().mockRejectedValue(new Error('connect timeout')),
    })

    await expect(client.ensureRelease({ tag: 'repo@1.0.0', target: 'abc123' })).rejects.toMatchObject({
      status: 0,
      message: expect.stringContaining('connect timeout'),
    })
  })

  it('creates and recovers an idempotent package tag through the REST API', async () => {
    const requestFetch = vi.fn()
      .mockResolvedValueOnce(response({ message: 'Not Found' }, 404))
      .mockResolvedValueOnce(response({ ref: 'refs/tags/repo@1.0.0' }, 201))
    const client = new GitHubClient({ token: 'token', repository: 'acme/repo', fetch: requestFetch })

    await client.ensureTag({ tag: 'repo@1.0.0', target: 'abc123' })

    expect(requestFetch).toHaveBeenNthCalledWith(2, 'https://api.github.com/repos/acme/repo/git/refs', expect.objectContaining({ method: 'POST' }))
    const request = requestFetch.mock.calls[1]?.[1] as RequestInit | undefined
    expect(JSON.parse(String(request?.body))).toEqual({ ref: 'refs/tags/repo@1.0.0', sha: 'abc123' })
  })

  it('lists releases and updates a repaired release body', async () => {
    const listFetch = vi.fn().mockResolvedValueOnce(response([
      { id: 8, html_url: 'https://github.com/acme/repo/releases/8', tag_name: 'repo@1.0.0' },
    ]))
    const listClient = new GitHubClient({ token: 'token', repository: 'acme/repo', fetch: listFetch })

    await expect(listClient.listReleases()).resolves.toHaveLength(1)
    expect(listFetch).toHaveBeenCalledWith('https://api.github.com/repos/acme/repo/releases?per_page=100&page=1', expect.objectContaining({ method: 'GET' }))

    const updateFetch = vi.fn().mockResolvedValueOnce(response({ id: 8, html_url: 'https://github.com/acme/repo/releases/8', tag_name: 'repo@1.0.0' }))
    const updateClient = new GitHubClient({ token: 'token', repository: 'acme/repo', fetch: updateFetch })
    await updateClient.updateRelease({ id: 8, name: 'repo@1.0.0', body: '### 🐞 Bug Fixes' })

    expect(updateFetch).toHaveBeenCalledWith('https://api.github.com/repos/acme/repo/releases/8', expect.objectContaining({ method: 'PATCH' }))
    const request = updateFetch.mock.calls[0]?.[1] as RequestInit | undefined
    expect(JSON.parse(String(request?.body))).toEqual({ name: 'repo@1.0.0', body: '### 🐞 Bug Fixes' })
  })

  it('continues listing releases across pagination boundaries', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      html_url: `https://github.com/acme/repo/releases/${index + 1}`,
      tag_name: `repo@1.0.${index}`,
    }))
    const requestFetch = vi.fn()
      .mockResolvedValueOnce(response(firstPage))
      .mockResolvedValueOnce(response([{ id: 101, html_url: 'https://github.com/acme/repo/releases/101', tag_name: 'repo@2.0.0' }]))
    const client = new GitHubClient({ token: 'token', repository: 'acme/repo', fetch: requestFetch })

    await expect(client.listReleases()).resolves.toHaveLength(101)
    expect(requestFetch).toHaveBeenNthCalledWith(2, 'https://api.github.com/repos/acme/repo/releases?per_page=100&page=2', expect.objectContaining({ method: 'GET' }))
  })
})
