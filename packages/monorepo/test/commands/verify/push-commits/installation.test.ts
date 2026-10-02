import { afterEach, describe, expect, it } from 'vitest'
import fs from '@/utils/fs'
import { createPushFixture, expectCleanedSnapshots, pushLine, runPush, snapshotOriginal } from './fixtures'

const fixtures: Awaited<ReturnType<typeof createPushFixture>>[] = []

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(item => fs.remove(item.directory)))
})

describe('built pre-push snapshot dependencies', () => {
  it('stops after frozen installation fails without a committed lockfile and removes the snapshot', async () => {
    const repo = await createPushFixture()
    fixtures.push(repo)
    await repo.put('package.json', JSON.stringify({
      name: 'fixture-root',
      private: true,
      dependencies: { 'fixture-a': 'workspace:*' },
    }))
    const head = repo.commit('dependency without lockfile')
    const before = await snapshotOriginal(repo)

    const result = await runPush(repo, pushLine('refs/heads/main', head, repo.main))

    expect(result.status, result.output).not.toBe(0)
    expect(result.output).toContain('ERR_PNPM_NO_LOCKFILE')
    expect(result.calls).toHaveLength(1)
    expect(result.calls[0]!.args).toEqual(['install', '--frozen-lockfile'])
    expect(result.calls[0]!.status).not.toBe(0)
    expect(result.checks).toEqual([])
    expect(await snapshotOriginal(repo)).toEqual(before)
    await expectCleanedSnapshots(repo, result.entries)
  }, 60000)

  it('installs the committed local dependency with a frozen lock and runs its lifecycle without borrowing node_modules', async () => {
    const repo = await createPushFixture()
    fixtures.push(repo)
    await repo.put('package.json', JSON.stringify({
      name: 'fixture-root',
      private: true,
      dependencies: { 'fixture-a': 'workspace:*' },
      scripts: { prepare: 'node prepare.mjs' },
    }))
    await repo.put('modules/a/package.json', JSON.stringify({ name: 'fixture-a', private: true, main: 'index.cjs', scripts: { test: 'node check.mjs' } }))
    await repo.put('modules/a/index.cjs', 'module.exports = "committed dependency"\n')
    await repo.put('prepare.mjs', `
      import { appendFileSync, existsSync } from 'node:fs'
      import { createRequire } from 'node:module'
      const dependency = createRequire(import.meta.url)('fixture-a')
      appendFileSync(process.env.REPOCTL_PUSH_TRACE, JSON.stringify({ kind: 'prepare', cwd: process.cwd(), dependency, borrowed: existsSync('node_modules/original-only.txt') }) + '\\n')
    `)
    await repo.put('pnpm-lock.yaml', [
      'lockfileVersion: \'9.0\'',
      'settings:',
      '  autoInstallPeers: true',
      '  excludeLinksFromLockfile: false',
      'importers:',
      '  .:',
      '    dependencies:',
      '      fixture-a:',
      '        specifier: workspace:*',
      '        version: link:modules/a',
      '  modules/a: {}',
      '  modules/b: {}',
      '',
    ].join('\n'))
    const head = repo.commit('dependency and lifecycle')
    await repo.put('node_modules/original-only.txt', 'must remain in the original workspace\n')
    const before = await snapshotOriginal(repo)

    const result = await runPush(repo, pushLine('refs/heads/main', head, repo.main))

    expect(result.status, result.output).toBe(0)
    const installs = result.calls.filter(call => call.args?.includes('install'))
    expect(installs).toHaveLength(1)
    expect(installs[0]!.args).toContain('--frozen-lockfile')
    expect(result.entries.filter(entry => entry.kind === 'prepare')).toMatchObject([
      { dependency: 'committed dependency', borrowed: false },
    ])
    expect(result.checks.map(entry => entry.state).sort()).toEqual(['healthy base b', 'healthy main a'])
    expect(await snapshotOriginal(repo)).toEqual(before)
    await expectCleanedSnapshots(repo, result.entries)
  }, 60000)
})
