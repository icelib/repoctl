import { readFile, writeFile } from 'node:fs/promises'
import { releaseCi } from '@icebreakers/monorepo'
import path from 'pathe'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanupReleaseTempRoots, createSpawnMock, createTempWorkspace, writePendingIntent } from '../release-fixtures'

afterEach(cleanupReleaseTempRoots)
const source = 'a'.repeat(40)

async function fixture(npmStatus: number, npmOutput: string, npmError = '', propagated = false) {
  const cwd = await createTempWorkspace('main')
  await writePendingIntent(cwd)
  const ledger = propagated ? '{}\n' : 'repoctl@1.0.0:\n  dir: packages/repoctl\n  intents: [original]\n'
  const changelog = '# repoctl\n\n## 1.0.0\n\n- Updated dependency.\n\n## 0.9.0\n\n- Previous release.\n'
  const committedFiles = {
    '.changeset/ledger.yaml': ledger,
    'packages/repoctl/package.json': JSON.stringify({ name: 'repoctl', version: '1.0.0' }),
    ...(propagated ? { 'packages/repoctl/CHANGELOG.md': changelog } : {}),
  }
  await writeFile(path.join(cwd, '.changeset/ledger.yaml'), ledger)
  if (propagated) {
    await writeFile(path.join(cwd, 'packages/repoctl/CHANGELOG.md'), changelog)
  }
  const h = createSpawnMock({
    statuses: { 'npm view repoctl@1.0.0 --json': npmStatus },
    stdout: {
      'npm view repoctl@1.0.0 --json': npmOutput,
      'git rev-parse --is-shallow-repository': 'false',
      ...Object.fromEntries(Object.entries(committedFiles).flatMap(([filename, contents]) => [
        [`git log --first-parent --format=%H -- ${filename}`, source],
        [`git ls-tree ${source} -- ${filename}`, `100644 blob ${'b'.repeat(40)}\t${filename}`],
        [`git show ${source}:${filename}`, contents],
      ])),
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

it('does not overwrite an unpublished prerelease when new intents arrive', async () => {
  const h = await fixture(1, '', 'E404 Not Found')
  await writeFile(path.join(h.cwd, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\nversioning:\n  lanes:\n    repoctl: alpha\n')
  await expect(releaseCi({ ...h.options, mode: 'auto', branch: 'alpha' })).rejects.toThrow(`check out ${source} on alpha`)
  expect(h.calls.some(call => call.command === 'pnpm')).toBe(false)
})

it('protects propagated versions even when pnpm did not add a ledger entry', async () => {
  const h = await fixture(1, '', 'E404 Not Found', true)
  await expect(releaseCi(h.options)).rejects.toThrow(`--source-sha ${source}`)
  expect(h.calls.some(call => call.command === 'pnpm')).toBe(false)
})
