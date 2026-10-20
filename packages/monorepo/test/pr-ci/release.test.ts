import { resolveReleaseBranches } from '@icebreakers/monorepo'
import { describe, expect, it, vi } from 'vitest'
import { releasePullRequestHead } from '@/commands/release/lines'
import { createGitHubClient } from '../../../../.github/auto-changeset/github.mjs'
import { requestReleaseValidation } from '../../../../.github/pr-ci/release.mjs'
import { headSha } from './fixture'

function fixture(baseBranch = 'main', headRef = 'release/pnpm-version') {
  const pr = {
    number: 42,
    state: 'open',
    draft: false,
    head: { ref: headRef, sha: headSha, repo: { full_name: 'acme/repo' } },
    base: { ref: baseBranch },
  }
  const client = {
    repository: 'acme/repo',
    listReleasePullRequests: vi.fn(async () => [pr]),
    dispatchPrValidation: vi.fn(async (_number: number, _ref: string) => {}),
  }
  const options = {
    receipt: { action: 'prepare', done: ['plan', 'verify', 'prepare'] },
    usesEventToken: true,
    baseBranch,
    defaultBranch: 'main',
    headRef,
    headSha,
  }
  return { pr, client, options }
}

describe('Release PR approval request', () => {
  it('requests a gated default-branch run for the exact token-created Release PR', async () => {
    const h = fixture()
    await expect(requestReleaseValidation(h.client, h.options)).resolves.toBe(42)
    expect(h.client.listReleasePullRequests).toHaveBeenCalledWith('main', 'release/pnpm-version')
    expect(h.client.dispatchPrValidation).toHaveBeenCalledExactlyOnceWith(42, 'main')
  })

  const releaseRules = resolveReleaseBranches({
    stable: 'trunk',
    maintenance: [
      { branch: '1.x', range: '1.x', tag: 'legacy-1' },
      { branch: 'support/2.x', range: '2.x', tag: 'legacy-2' },
    ],
    prerelease: [],
  })

  it.each(releaseRules)('accepts the actual prepared branch for the $branch release line', async (rule) => {
    const headRef = releasePullRequestHead(rule)
    const h = fixture(rule.branch, headRef)
    await expect(requestReleaseValidation(h.client, h.options)).resolves.toBe(42)
    expect(h.client.listReleasePullRequests).toHaveBeenCalledExactlyOnceWith(rule.branch, headRef)
    expect(h.client.dispatchPrValidation).toHaveBeenCalledExactlyOnceWith(42, 'main')
  })

  it('queries GitHub with the exact prepared base and head, including encoded maintenance refs', async () => {
    const h = fixture('support/2.x', 'release/pnpm-version-support%2F2.x')
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify([h.pr]), { status: 200 }))
    const client = createGitHubClient({ token: 'test-token', repository: 'acme/repo', fetchImpl })
    await client.listReleasePullRequests(h.options.baseBranch, h.options.headRef)
    const url = new URL(fetchImpl.mock.calls[0]![0] as string)
    expect(url.pathname).toBe('/repos/acme/repo/pulls')
    expect(url.searchParams.get('state')).toBe('open')
    expect(url.searchParams.get('base')).toBe('support/2.x')
    expect(url.searchParams.get('head')).toBe('acme:release/pnpm-version-support%2F2.x')
  })

  it('dispatches built-in-token Release diagnostics to the isolated manual workflow', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }))
    const client = createGitHubClient({ token: 'test-token', repository: 'acme/repo', fetchImpl })
    await client.dispatchPrValidation(42, 'main')
    const [url, request] = fetchImpl.mock.calls[0]!
    expect(new URL(url as string).pathname).toBe('/repos/acme/repo/actions/workflows/pr-ci-manual.yml/dispatches')
    expect(request?.method).toBe('POST')
    expect(JSON.parse(request?.body as string)).toEqual({ ref: 'main', inputs: { pr_number: '42' } })
  })

  it('reads a fork head ref from its own repository without changing the base repository', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ object: { sha: headSha } }), { status: 200 }))
    const client = createGitHubClient({ token: 'test-token', repository: 'acme/repo', fetchImpl })
    await client.getRef('heads/feature/fix', 'contributor/fork')
    await client.getRef('heads/main')
    expect(fetchImpl.mock.calls.map(([url]) => new URL(url as string).pathname)).toEqual([
      '/repos/contributor/fork/git/ref/heads/feature/fix',
      '/repos/acme/repo/git/ref/heads/main',
    ])
  })

  it.each(['app token', 'publish', 'incomplete preparation', 'no releases'])('does not dispatch for %s', async (kind) => {
    const h = fixture()
    if (kind === 'app token') {
      h.options.usesEventToken = false
    }
    if (kind === 'publish') {
      h.options.receipt.action = 'publish'
    }
    if (kind === 'incomplete preparation') {
      h.options.receipt.done = ['plan', 'verify']
    }
    if (kind === 'no releases') {
      h.options.headRef = h.options.baseBranch
    }
    await expect(requestReleaseValidation(h.client, h.options)).resolves.toBe(false)
    expect(h.client.listReleasePullRequests).not.toHaveBeenCalled()
    expect(h.client.dispatchPrValidation).not.toHaveBeenCalled()
  })

  it('does not dispatch when preparation leaves HEAD on a configured stable base', async () => {
    const h = fixture('trunk', 'trunk')
    await expect(requestReleaseValidation(h.client, h.options)).resolves.toBe(false)
    expect(h.client.listReleasePullRequests).not.toHaveBeenCalled()
  })

  it.each(['stale commit', 'fork', 'draft', 'closed', 'wrong base', 'wrong head'])('refuses a %s Release PR', async (kind) => {
    const h = fixture()
    if (kind === 'stale commit') {
      h.pr.head.sha = 'b'.repeat(40)
    }
    if (kind === 'fork') {
      h.pr.head.repo.full_name = 'contributor/repo'
    }
    if (kind === 'draft') {
      h.pr.draft = true
    }
    if (kind === 'closed') {
      h.pr.state = 'closed'
    }
    if (kind === 'wrong base') {
      h.pr.base.ref = 'next'
    }
    if (kind === 'wrong head') {
      h.pr.head.ref = 'release/pnpm-version-1.x'
    }
    await expect(requestReleaseValidation(h.client, h.options)).rejects.toThrow('Prepared Release PR not found')
    expect(h.client.dispatchPrValidation).not.toHaveBeenCalled()
  })
})
