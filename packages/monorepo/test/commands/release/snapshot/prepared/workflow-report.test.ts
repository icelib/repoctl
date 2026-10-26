import { Script } from 'node:vm'
import { getSnapshotWorkflows } from '@icebreakers/monorepo'
import { expect, it, vi } from 'vitest'
import { parse } from 'yaml'

async function fixture() {
  const { publish } = await getSnapshotWorkflows()
  const workflow = parse(publish)
  const source = { repository: 'acme/repo', pullRequest: 12, headSha: 'a'.repeat(40), baseSha: 'b'.repeat(40), mergeSha: 'c'.repeat(40), runId: 100, runAttempt: 1 }
  const report = { status: 'published', manifest: { plan: { source } }, installCommand: 'pnpm add snapshot-a@1.0.0-snapshot.pr.12.example' }
  const summary = { addRaw: vi.fn(), write: vi.fn() }
  summary.addRaw.mockReturnValue(summary)
  const issues = { listComments: vi.fn(), createComment: vi.fn(), updateComment: vi.fn() }
  const pr = { state: 'open', head: { sha: source.headSha }, base: { sha: source.baseSha }, merge_commit_sha: source.mergeSha }
  const comments: Array<{ id: number, user: { login: string }, body: string }> = []
  const script = workflow.jobs.report.steps.find((step: { uses?: string }) => step.uses?.startsWith('actions/github-script@')).with.script
  const run = () => new Script(`(async () => { ${script} })()`).runInNewContext({
    require: (specifier: string) => {
      expect(specifier).toBe('node:fs')
      return { readFileSync: () => JSON.stringify(report) }
    },
    process: { env: { RUNNER_TEMP: '/tmp', PR_NUMBER: '12', CONSUMER_RESULT: 'failure' } },
    context: { repo: { owner: 'acme', repo: 'repo' }, runId: 1000 },
    github: { rest: { pulls: { get: async () => ({ data: pr }) }, issues }, paginate: async () => comments },
    core: { summary },
  })
  return { report, source, comments, pr, issues, summary, run }
}

it('reports confirmed versions with the actual consumer job result even when consumer validation failed', async () => {
  const h = await fixture()
  await h.run()
  expect(h.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({
    issue_number: 12,
    body: expect.stringContaining(h.report.installCommand),
  }))
  const body = h.issues.createComment.mock.calls[0]![0].body as string
  expect(body).toContain('Consumer verification: failure.')
  expect(body).toContain('<!-- repoctl-pr-snapshot-build:100:1 -->')
  expect(h.summary.write).toHaveBeenCalledOnce()
})

it('does not overwrite a newer build comment when an older consumer completes later', async () => {
  const h = await fixture()
  h.comments.push({ id: 5, user: { login: 'github-actions[bot]' }, body: '<!-- repoctl-pr-snapshot -->\n<!-- repoctl-pr-snapshot-build:101:1 -->\nnew install command' })
  await h.run()
  expect(h.issues.createComment).not.toHaveBeenCalled()
  expect(h.issues.updateComment).not.toHaveBeenCalled()
  expect(h.summary.addRaw).toHaveBeenCalledWith('A newer snapshot already owns the PR installation comment.')
})

it('refuses a changed PR revision and an unconfirmed publication report before commenting', async () => {
  const h = await fixture()
  h.pr.head.sha = 'd'.repeat(40)
  await expect(h.run()).rejects.toThrow('PR revision changed')
  h.pr.head.sha = h.source.headSha
  h.report.status = 'failed'
  await expect(h.run()).rejects.toThrow('Publication report identity mismatch')
  expect(h.issues.createComment).not.toHaveBeenCalled()
  expect(h.issues.updateComment).not.toHaveBeenCalled()
})
