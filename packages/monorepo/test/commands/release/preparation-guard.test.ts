import { readFile, writeFile } from 'node:fs/promises'
import { releaseCi } from '@icebreakers/monorepo'
import path from 'pathe'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanupReleaseTempRoots, createSpawnMock, createTempWorkspace, writePendingIntent } from '../release-fixtures'

afterEach(cleanupReleaseTempRoots)
const source = 'a'.repeat(40)

async function fixture(npmStatus: number, npmOutput: string, npmError = '') {
  const cwd = await createTempWorkspace('main')
  await writePendingIntent(cwd)
  await writeFile(path.join(cwd, '.changeset/ledger.yaml'), 'repoctl@1.0.0:\n  dir: packages/repoctl\n  intents: [original]\n')
  const h = createSpawnMock({
    statuses: { 'npm view repoctl@1.0.0 --json': npmStatus },
    stdout: {
      'npm view repoctl@1.0.0 --json': npmOutput,
      'git rev-parse --is-shallow-repository': 'false',
      'git log --format=%H -- packages/repoctl/package.json': source,
      [`git show ${source}:packages/repoctl/package.json`]: JSON.stringify({ name: 'repoctl', version: '1.0.0' }),
    },
    stderr: { 'npm view repoctl@1.0.0 --json': npmError },
  })
  const github = { ensurePullRequest: vi.fn(), ensureRelease: vi.fn() }
  const options = { cwd, mode: 'prepare' as const, branch: 'main', github, spawn: h.spawn as never, sleep: async () => {}, config: { hooks: { beforeVersion: ['must-not-run'] } } }
  return { ...h, options, github, cwd }
}

it('preserves new intents and stops before hooks when the previous version is absent', async () => {
  const h = await fixture(1, '', 'E404 Not Found')
  await expect(releaseCi(h.options)).rejects.toThrow(`--source-sha ${source}`)
  expect(h.calls.some(call => call.command === 'pnpm')).toBe(false)
  expect(h.github.ensurePullRequest).not.toHaveBeenCalled()
  expect(await readFile(path.join(h.cwd, '.changeset/pending-change.md'), 'utf8')).toContain('patch')
})

it.each(['E401 Unauthorized', 'ETIMEDOUT', 'invalid certificate'])('does not treat %s as an unpublished version', async (error) => {
  const h = await fixture(1, '', error)
  await expect(releaseCi(h.options)).rejects.toThrow(/authentication failed|state is unknown/)
  expect(h.calls.some(call => call.command === 'pnpm')).toBe(false)
})

it('blocks preparation while published versions are missing GitHub metadata', async () => {
  const h = await fixture(0, JSON.stringify({ version: '1.0.0', gitHead: source }))
  await expect(releaseCi({ ...h.options, github: { ...h.github, listReleases: async () => [], readTagTarget: async () => undefined } })).rejects.toThrow('Prepared releases must finish')
  expect(h.calls.some(call => call.command === 'pnpm')).toBe(false)
})

it('blocks unfinished checkpoints even when npm and metadata exist', async () => {
  const h = await fixture(0, JSON.stringify({ version: '1.0.0', gitHead: source }))
  await expect(releaseCi({
    ...h.options,
    env: { GITHUB_REPOSITORY: 'acme/repo' },
    github: {
      ...h.github,
      listReleases: async () => [{ id: 1, html_url: '', tag_name: 'repoctl@1.0.0' }],
      readTagTarget: async () => source,
      readReleaseState: async () => ({ revision: '1', state: { schemaVersion: 1, complete: false } as never }),
    },
  })).rejects.toThrow('Prepared releases must finish')
  expect(h.calls.some(call => call.command === 'pnpm')).toBe(false)
})
