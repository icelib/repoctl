import type { ReleaseCiOptions } from '@icebreakers/monorepo'
import { rm, writeFile } from 'node:fs/promises'
import { publishStable, releaseCi } from '@icebreakers/monorepo'
import crossSpawn from 'cross-spawn'
import path from 'pathe'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanupReleaseTempRoots } from '../../release-fixtures'
import { snapshot } from '../plan/fixture'
import { recoveryRemote, recoveryRunner } from '../recovery-fixtures'
import { branches, lineFixture } from './fixture'

afterEach(cleanupReleaseTempRoots)

it('recovers a source only from the selected maintenance history and preserves the dispatch identity', async () => {
  const h = await lineFixture()
  h.git('remote', 'add', 'origin', 'https://github.com/acme/repo.git')
  await h.write('repoctl.config.mjs', 'throw new Error("historical configuration must not run during dry-run")')
  await rm(path.join(h.cwd, '.changeset/test.md'))
  h.git('add', '.')
  h.git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'baseline')
  h.git('update-ref', 'refs/remotes/origin/1.x', 'HEAD')
  await h.write('packages/a/package.json', '{"name":"a","version":"1.0.1"}')
  await h.write('packages/a/CHANGELOG.md', '# a\n\n## 1.0.1\n\n- Maintenance fix.\n')
  h.git('add', '.')
  h.git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'chore(release): version packages')
  const source = h.git('rev-parse', 'HEAD')
  const calls: string[][] = []
  const spawn: NonNullable<ReleaseCiOptions['spawn']> = ((command: string, args: string[], options: never) => {
    calls.push([command, ...args])
    if (command === 'npm') {
      return { status: 1, stdout: '', stderr: 'E404 Not Found' }
    }
    return crossSpawn.sync(command, args, options)
  }) as NonNullable<ReleaseCiOptions['spawn']>
  const github = { ensurePullRequest: vi.fn(), ensureRelease: vi.fn(), ensureTag: vi.fn(), listReleases: vi.fn(async () => []), readReleaseState: vi.fn(async () => undefined), writeReleaseState: vi.fn() }
  const options: ReleaseCiOptions = { ...h.options, sourceSha: source, mode: 'publish', dryRun: true, spawn, github, env: { ...h.env, GITHUB_REPOSITORY: 'acme/repo', GITHUB_REF_NAME: '1.x', GITHUB_SHA: source } }
  await expect(releaseCi(options)).rejects.toThrow('merge-base --is-ancestor')
  expect(calls.some(call => call[1] === 'clone')).toBe(false)
  h.git('update-ref', 'refs/remotes/origin/1.x', source)
  const before = await snapshot(h.cwd)
  await expect(releaseCi(options)).resolves.toEqual([{ name: 'a', version: '1.0.1' }])
  expect(calls).toContainEqual(['git', 'merge-base', '--is-ancestor', source, 'refs/remotes/origin/1.x'])
  expect(calls.some(call => call[0] === 'pnpm')).toBe(false)
  expect(github.writeReleaseState).not.toHaveBeenCalled()
  expect(github.ensureRelease).not.toHaveBeenCalled()
  expect(await snapshot(h.cwd)).toEqual(before)
})

it('uses a maintenance npm tag while recording stable GitHub release metadata and an idempotent checkpoint', async () => {
  const remote = recoveryRemote()
  const h = await recoveryRunner(remote)
  const original = h.spawn.getMockImplementation()!
  h.spawn.mockImplementation((command, args, options) => {
    const result = original(command, args, options)
    if (command === 'npm' && args.includes('--json') && result.status === 0) {
      const metadata = JSON.parse(result.stdout)
      metadata['dist-tags']['legacy-1'] = metadata.version
      return { ...result, stdout: JSON.stringify(metadata) }
    }
    return result
  })
  const options = { ...h.options, branch: '1.x', config: { ...h.options.config, branches } }
  await releaseCi(options)
  expect(h.uploads()[0]?.args).toContain('legacy-1')
  expect(h.uploads()[0]?.args).not.toContain('latest')
  expect([...remote.releases.values()].every(release => release.prerelease === false)).toBe(true)
  expect(remote.state()?.complete).toBe(true)
  await releaseCi(options)
  expect(h.uploads()).toHaveLength(1)
})

it.each(['publish', 'publish-unpublished'])('rechecks actual versions after beforePublish hooks before %s', async (mode) => {
  const h = await lineFixture()
  await rm(path.join(h.cwd, '.changeset/test.md'))
  const calls: string[][] = []
  const spawn: NonNullable<ReleaseCiOptions['spawn']> = vi.fn((command: string, args: string[]) => {
    calls.push([command, ...args])
    return { status: 0, stdout: '', stderr: '' }
  }) as never
  // The hook is represented by a deterministic test write in the synchronous spawn boundary.
  const { writeFileSync } = await import('node:fs')
  vi.mocked(spawn).mockImplementation(((command: string, args: string[]) => {
    calls.push([command, ...args])
    if (command === 'pnpm' && args[1] === 'mutate') {
      writeFileSync(path.join(h.cwd, 'packages/a/package.json'), '{"name":"a","version":"2.0.0"}')
    }
    return { status: 0, stdout: args[0] === '--filter' ? '1.0.0' : '', stderr: '' }
  }) as never)
  const options = { ...h.options, spawn, config: { branches, qualityScripts: [], hooks: { beforePublish: ['mutate'] } } }
  const operation = mode === 'publish' ? publishStable(options) : releaseCi({ ...options, mode: 'publish-unpublished', packageName: 'a', packageVersion: '1.0.0', github: { ensurePullRequest: vi.fn(), ensureRelease: vi.fn() } })
  await expect(operation).rejects.toThrow('outside release line 1.x')
  expect(calls.filter(call => call[0] === 'pnpm' && call[1] !== '--filter')).toEqual([['pnpm', 'run', 'mutate']])
  await writeFile(path.join(h.cwd, 'packages/a/package.json'), '{"name":"a","version":"1.0.0"}')
})
