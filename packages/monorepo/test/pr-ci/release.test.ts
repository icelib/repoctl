import { describe, expect, it, vi } from 'vitest'
import { requestReleaseValidation } from '../../../../.github/pr-ci/release.mjs'
import { headSha } from './fixture'

function fixture() {
  const pr = {
    number: 42,
    state: 'open',
    draft: false,
    head: { ref: 'pnpm-release/main', sha: headSha, repo: { full_name: 'acme/repo' } },
    base: { ref: 'main' },
  }
  const client = {
    repository: 'acme/repo',
    listReleasePullRequests: vi.fn(async () => [pr]),
    dispatchPrValidation: vi.fn(async (_number: number, _ref: string) => {}),
  }
  const options = {
    receipt: { action: 'prepare', done: ['plan', 'verify', 'prepare'] },
    usesEventToken: true,
    baseBranch: 'main',
    defaultBranch: 'main',
    headRef: 'pnpm-release/main',
    headSha,
  }
  return { pr, client, options }
}

describe('Release PR approval request', () => {
  it('requests a gated default-branch run for the exact token-created Release PR', async () => {
    const h = fixture()
    await expect(requestReleaseValidation(h.client, h.options)).resolves.toBe(42)
    expect(h.client.listReleasePullRequests).toHaveBeenCalledWith('main')
    expect(h.client.dispatchPrValidation).toHaveBeenCalledExactlyOnceWith(42, 'main')
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
      h.options.headRef = 'main'
    }
    await expect(requestReleaseValidation(h.client, h.options)).resolves.toBe(false)
    expect(h.client.listReleasePullRequests).not.toHaveBeenCalled()
    expect(h.client.dispatchPrValidation).not.toHaveBeenCalled()
  })

  it.each(['stale commit', 'fork', 'draft', 'wrong base'])('refuses a %s Release PR', async (kind) => {
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
    if (kind === 'wrong base') {
      h.pr.base.ref = 'next'
    }
    await expect(requestReleaseValidation(h.client, h.options)).rejects.toThrow('Prepared Release PR not found')
    expect(h.client.dispatchPrValidation).not.toHaveBeenCalled()
  })
})
