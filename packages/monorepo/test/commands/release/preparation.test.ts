import { readFile, writeFile } from 'node:fs/promises'
import { prepareStable, releaseCi } from '@icebreakers/monorepo'
import path from 'pathe'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanupReleaseTempRoots, createSpawnMock, createTempWorkspace, writePendingIntent } from '../release-fixtures'

afterEach(cleanupReleaseTempRoots)

const github = () => ({ ensurePullRequest: vi.fn(), ensureRelease: vi.fn() })

it.each(['---\nrepoctl: none\n---\nNo release.', '---\n---\nNo release.'])('ignores declined/empty intents without consuming them: %s', async (content) => {
  const cwd = await createTempWorkspace('main')
  await writeFile(path.join(cwd, '.changeset/declined.md'), content)
  const h = createSpawnMock()
  expect(await prepareStable({ cwd, branch: 'main', spawn: h.spawn as never })).toBe(false)
  expect(h.calls).toEqual([])
  expect(await readFile(path.join(cwd, '.changeset/declined.md'), 'utf8')).toBe(content)
})

it('publishes the merged release despite a leftover none intent (#925)', async () => {
  const cwd = await createTempWorkspace('main')
  await writeFile(path.join(cwd, '.changeset/declined.md'), '---\nrepoctl: none\n---\nTests only.')
  const h = createSpawnMock({ stdout: { 'git log -1 --format=%s HEAD': 'chore(release): version packages (#923)' } })
  const remote = github()
  await releaseCi({ cwd, branch: 'main', spawn: h.spawn as never, github: remote, env: { GITHUB_EVENT_NAME: 'push' } })
  expect(h.calls.some(call => call.command === 'pnpm' && call.args[0] === 'publish')).toBe(true)
  expect(h.calls.some(call => call.command === 'pnpm' && call.args[0] === 'version')).toBe(false)
  expect(remote.ensurePullRequest).not.toHaveBeenCalled()
})

it('skips a none-only ordinary push', async () => {
  const cwd = await createTempWorkspace('main')
  await writeFile(path.join(cwd, '.changeset/declined.md'), '---\nrepoctl: none\n---\nTests only.')
  const h = createSpawnMock()
  await releaseCi({ cwd, branch: 'main', spawn: h.spawn as never, github: github(), env: { GITHUB_EVENT_NAME: 'push' } })
  expect(h.calls.every(call => call.command === 'git')).toBe(true)
})

it('does not re-consume resurrected intent files recorded in the ledger', async () => {
  const cwd = await createTempWorkspace('main')
  await writePendingIntent(cwd)
  await writeFile(path.join(cwd, '.changeset/ledger.yaml'), 'repoctl@1.0.0:\n  dir: packages/repoctl\n  intents: [pending-change]\n')
  const h = createSpawnMock()
  expect(await prepareStable({ cwd, branch: 'main', spawn: h.spawn as never })).toBe(false)
  expect(h.calls).toEqual([])
})

it.each(['---\nrepoctl: [\n---', '---\nrepoctl: wat\n---', 'no frontmatter'])('fails closed on malformed intents: %s', async (content) => {
  const cwd = await createTempWorkspace('main')
  await writeFile(path.join(cwd, '.changeset/broken.md'), content)
  const h = createSpawnMock()
  await expect(prepareStable({ cwd, branch: 'main', spawn: h.spawn as never })).rejects.toThrow('Invalid change intent')
  expect(h.calls).toEqual([])
})

it('does not push a PR when pnpm only cleans files', async () => {
  const cwd = await createTempWorkspace('main')
  await writePendingIntent(cwd)
  const h = createSpawnMock({ diffStatus: 1, versionOutput: '[]' })
  const remote = github()
  await releaseCi({ cwd, branch: 'main', mode: 'prepare', spawn: h.spawn as never, github: remote })
  expect(remote.ensurePullRequest).not.toHaveBeenCalled()
  expect(h.calls.some(call => call.command === 'git' && ['commit', 'push'].includes(call.args[0]!))).toBe(false)
})

it.each(['invalid', '{}', '[{"name":"repoctl","currentVersion":"1.0.0","newVersion":"1.0.1"}]'])('rejects invalid or mismatched version results before pushing: %s', async (versionOutput) => {
  const cwd = await createTempWorkspace('main')
  await writePendingIntent(cwd)
  const h = createSpawnMock({ diffStatus: 1, versionOutput })
  const remote = github()
  await expect(releaseCi({ cwd, branch: 'main', mode: 'prepare', spawn: h.spawn as never, github: remote })).rejects.toThrow()
  expect(remote.ensurePullRequest).not.toHaveBeenCalled()
  expect(h.calls.some(call => call.command === 'git' && call.args[0] === 'push')).toBe(false)
})

it('includes a first release even if its version stays unchanged', async () => {
  const cwd = await createTempWorkspace('main')
  await writePendingIntent(cwd)
  const h = createSpawnMock({ diffStatus: 1, versionedPackages: [{ name: 'repoctl', version: '1.0.0' }] })
  const remote = github()
  await releaseCi({ cwd, branch: 'main', mode: 'prepare', spawn: h.spawn as never, github: remote })
  expect(remote.ensurePullRequest).toHaveBeenCalledWith(expect.objectContaining({ body: expect.stringContaining('1 package updated') }))
  expect(remote.ensurePullRequest).toHaveBeenCalledWith(expect.objectContaining({ body: expect.stringContaining('| `repoctl` | — | `1.0.0` |') }))
})

it('rejects missing release notes before any push', async () => {
  const cwd = await createTempWorkspace('main')
  await writePendingIntent(cwd)
  const h = createSpawnMock({ diffStatus: 1, versionOutput: '[{"name":"repoctl","currentVersion":"1.0.0","newVersion":"1.0.0"}]' })
  const remote = github()
  await expect(releaseCi({ cwd, branch: 'main', mode: 'prepare', spawn: h.spawn as never, github: remote })).rejects.toThrow('Missing release notes')
  expect(h.calls.some(call => call.command === 'git' && call.args[0] === 'push')).toBe(false)
})
