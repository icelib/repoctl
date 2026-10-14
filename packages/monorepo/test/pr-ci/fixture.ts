import type { processPullRequest } from '../../../../.github/auto-changeset/index.mjs'
import { vi } from 'vitest'

export const headSha = 'a'.repeat(40)
export const baseSha = 'b'.repeat(40)
export const mergeSha = 'c'.repeat(40)
export const preparedSha = 'd'.repeat(40)

export function fixture() {
  const pr = {
    number: 42,
    state: 'open',
    draft: false,
    mergeable: true as boolean | null,
    merge_commit_sha: mergeSha,
    changed_files: 1,
    head: { ref: 'feature/fix', sha: headSha, repo: { full_name: 'acme/repo' } },
    base: { ref: 'main', sha: baseSha, repo: { full_name: 'acme/repo' } },
  }
  const client = {
    repository: 'acme/repo',
    getPullRequest: vi.fn(async () => structuredClone(pr)),
    getRef: vi.fn(async (ref: string) => ({ object: { sha: ref === `heads/${pr.head.ref}` ? pr.head.sha : baseSha } })),
    getCommit: vi.fn(async () => ({ parents: [{ sha: baseSha }, { sha: pr.head.sha }] })),
    compareCommits: vi.fn(async () => ({ files: [{ filename: 'packages/demo/src/index.ts' }] })),
    getStatus: vi.fn(async () => ({ statuses: [{ context: 'PR Validation', target_url: 'https://github.com/acme/repo/actions/runs/123' }] })),
    createStatus: vi.fn(async () => ({})),
  }
  const options = {
    number: 42,
    expectedHeadSha: headSha,
    targetUrl: 'https://github.com/acme/repo/actions/runs/123',
    wait: vi.fn(async () => {}),
    processIntent: vi.fn<typeof processPullRequest>(async () => ({ action: 'skipped', number: 42 })),
  }
  return { pr, client, options }
}
