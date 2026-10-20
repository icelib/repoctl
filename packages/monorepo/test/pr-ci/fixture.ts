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
    labels: [] as { name: string }[],
    head: { ref: 'feature/fix', sha: headSha, repo: { full_name: 'acme/repo' } },
    base: { ref: 'main', sha: baseSha, repo: { full_name: 'acme/repo' } },
  }
  const client = {
    repository: 'acme/repo',
    getPullRequest: vi.fn(async () => structuredClone(pr)),
    getRef: vi.fn(async (ref: string, _repository?: string) => ({ object: { sha: ref === `heads/${pr.head.ref}` ? pr.head.sha : baseSha } })),
    getCommit: vi.fn(async () => ({ parents: [{ sha: baseSha }, { sha: pr.head.sha }] })),
    compareCommits: vi.fn(async () => ({ files: [{ filename: 'packages/demo/src/index.ts' }] })),
    getStatus: vi.fn(async () => ({ statuses: [{ context: 'Manual PR Validation', target_url: 'https://github.com/acme/repo/actions/runs/123' }] })),
    createStatus: vi.fn(async () => ({})),
    createCommit: vi.fn(async () => ({})),
    updateRef: vi.fn(async () => ({})),
    createComment: vi.fn(async () => ({})),
  }
  const options = {
    number: 42,
    expectedHeadSha: headSha,
    expectedBaseSha: baseSha,
    expectedBaseRef: 'main',
    expectedHeadRef: 'feature/fix',
    expectedHeadRepository: 'acme/repo',
    expectedMergeSha: mergeSha,
    expectedReleaseLabels: [] as string[],
    wait: vi.fn(async () => {}),
  }
  return { pr, client, options }
}
