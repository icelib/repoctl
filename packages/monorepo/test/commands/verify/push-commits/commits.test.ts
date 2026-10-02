import { realpath } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import fs from '@/utils/fs'
import { createPushFixture, expectCleanedSnapshots, pushLine, runPush, snapshotOriginal } from './fixtures'

const fixtures: Awaited<ReturnType<typeof createPushFixture>>[] = []

async function fixture(nested = false) {
  const result = await createPushFixture(nested)
  fixtures.push(result)
  return result
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(item => fs.remove(item.directory)))
})

describe('built pre-push verifies pushed commits', () => {
  it('checks a broken branch from a healthy checkout and cleans the failed snapshot', async () => {
    const repo = await fixture()
    const before = await snapshotOriginal(repo)
    const result = await runPush(repo, pushLine('refs/heads/broken', repo.broken, repo.base))

    expect(result.status, result.output).toBe(9)
    expect(result.checks).toMatchObject([{ state: 'BROKEN unpublished b', head: repo.broken }])
    expect(result.calls.some(call => call.args?.includes('install'))).toBe(false)
    expect(await snapshotOriginal(repo)).toEqual(before)
    await expectCleanedSnapshots(repo, result.entries)
  }, 60000)

  it('checks each pushed commit separately when one of several refs is broken', async () => {
    const repo = await fixture()
    const before = await snapshotOriginal(repo)
    const stdin = pushLine('refs/heads/main', repo.main, repo.base) + pushLine('refs/heads/broken', repo.broken, repo.base)
    const result = await runPush(repo, stdin)

    expect(result.status, result.output).toBe(9)
    expect(result.checks.map(({ state, head }) => ({ state, head }))).toEqual([
      { state: 'healthy main a', head: repo.main },
      { state: 'BROKEN unpublished b', head: repo.broken },
    ])
    expect(new Set(result.calls.map(call => call.cwd)).size).toBe(2)
    expect(result.calls.some(call => call.args?.includes('install'))).toBe(false)
    expect(await snapshotOriginal(repo)).toEqual(before)
    await expectCleanedSnapshots(repo, result.entries)
  }, 60000)

  it('deduplicates peeled commits and merges changes from refs with different bases', async () => {
    const repo = await fixture()
    repo.git('checkout', '-qb', 'combined', repo.base)
    await repo.put('modules/a/state.txt', 'combined a\n')
    const intermediate = repo.commit('combined a')
    await repo.put('modules/b/state.txt', 'combined b\n')
    const combined = repo.commit('combined b')
    repo.git('tag', '-a', 'combined-tag', '-m', 'annotated combined')
    const tag = repo.git('rev-parse', 'refs/tags/combined-tag')
    repo.git('checkout', '-q', 'main')
    const before = await snapshotOriginal(repo)
    const stdin = pushLine('refs/heads/combined', combined, intermediate)
      + pushLine('refs/heads/alias', combined, repo.base)
      + pushLine('refs/tags/combined-tag', tag, repo.base)
    const result = await runPush(repo, stdin)

    expect(result.status, result.output).toBe(0)
    expect(result.checks.map(entry => entry.state).sort()).toEqual(['combined a', 'combined b'])
    expect(result.checks.every(entry => entry.head === combined)).toBe(true)
    expect(new Set(result.calls.map(call => call.cwd)).size).toBe(1)
    expect(await snapshotOriginal(repo)).toEqual(before)
    await expectCleanedSnapshots(repo, result.entries)
  }, 60000)

  it('preserves staged, unstaged, and untracked content while checking committed files', async () => {
    const repo = await fixture()
    await repo.put('modules/b/state.txt', 'BROKEN staged b\n')
    repo.git('add', '.')
    await repo.put('modules/a/state.txt', 'BROKEN unstaged a\n')
    await repo.put('untracked notes.txt', 'user notes\n')
    const before = await snapshotOriginal(repo)
    const result = await runPush(repo, pushLine('refs/heads/main', repo.main, repo.base))

    expect(result.status, result.output).toBe(0)
    expect(result.checks).toMatchObject([{ state: 'healthy main a', head: repo.main }])
    expect(await snapshotOriginal(repo)).toEqual(before)
    await expectCleanedSnapshots(repo, result.entries)
  }, 60000)

  it.each([false, true])('maps a nested workspace into the snapshot (explicit workspaces: %s)', async (explicit) => {
    const repo = await fixture(true)
    const before = await snapshotOriginal(repo)
    const result = await runPush(repo, pushLine('refs/heads/broken', repo.broken, repo.base), explicit ? [path.join(repo.cwd, 'modules/b')] : undefined)

    expect(result.status, result.output).toBe(9)
    expect(result.checks).toMatchObject([{ state: 'BROKEN unpublished b', head: repo.broken }])
    expect(result.checks[0]!.cwd.replaceAll('\\', '/')).toMatch(/\/nested\/workspace\/modules\/b$/)
    expect(await snapshotOriginal(repo)).toEqual(before)
    await expectCleanedSnapshots(repo, result.entries)
  }, 60000)

  it('keeps empty hook input in local verification mode', async () => {
    const repo = await fixture()
    await repo.put('package.json', JSON.stringify({ name: 'fixture-root', private: true, scripts: { lint: 'node modules/a/check.mjs' } }))
    await repo.put('state.txt', 'local working tree\n')
    const before = await snapshotOriginal(repo)
    const result = await runPush(repo, '')

    expect(result.status, result.output).toBe(0)
    expect(result.checks).toMatchObject([{ state: 'local working tree', head: repo.main }])
    expect(await realpath(result.checks[0]!.cwd)).toBe(await realpath(repo.cwd))
    expect(result.calls.some(call => call.args?.includes('install'))).toBe(false)
    expect(await snapshotOriginal(repo)).toEqual(before)
  }, 60000)
})
