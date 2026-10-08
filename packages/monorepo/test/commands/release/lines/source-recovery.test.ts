import type { ReleaseCiOptions } from '@icebreakers/monorepo'
import type { SpawnSyncOptions } from 'node:child_process'
import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { releaseCi } from '@icebreakers/monorepo'
import crossSpawn from 'cross-spawn'
import { expect, it, vi } from 'vitest'
import { branches, lineFixture } from './fixture'

it('uses the historical pnpm version for installation and nested quality scripts without changing the dispatch checkout', async () => {
  const h = await lineFixture()
  const version = '12.9.1'
  const manifest = {
    private: true,
    packageManager: `pnpm@${version}`,
    scripts: { verify: 'pnpm --version' },
  }
  await h.write('package.json', JSON.stringify(manifest))
  await h.write('.npmrc', 'package-manager-strict=true\npackage-manager-strict-version=true\n')
  await h.write('repoctl.config.mjs', `export default ${JSON.stringify({ commands: { release: { branches, qualityScripts: ['verify'] } } })}`)
  await rm(path.join(h.cwd, '.changeset/test.md'))
  h.git('remote', 'add', 'origin', 'https://github.com/acme/repo.git')
  h.git('add', '.')
  h.git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'baseline')
  await h.write('packages/a/package.json', '{"name":"a","version":"1.0.1"}')
  h.git('add', '.')
  h.git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'chore(release): version packages')
  const source = h.git('rev-parse', 'HEAD')
  h.git('update-ref', 'refs/remotes/origin/1.x', source)
  // The dispatcher has since upgraded its package manager and accumulated new intents.
  const current = JSON.stringify({ ...manifest, packageManager: 'pnpm@12.10.1' })
  await h.write('package.json', current)
  await h.write('.changeset/new.md', '---\na: patch\n---\nFuture change.\n')
  const versions: string[] = []
  const seenEnvironments: NodeJS.ProcessEnv[] = []
  const spawn: NonNullable<ReleaseCiOptions['spawn']> = ((command: string, args: string[], options: SpawnSyncOptions) => {
    if (command === 'npm') {
      return { status: 0, stdout: args.includes('--json') ? JSON.stringify({ 'version': '1.0.1', 'gitHead': source, 'dist-tags': { 'legacy-1': '1.0.1' } }) : '1.0.1', stderr: '' }
    }
    if (command === 'pnpm') {
      seenEnvironments.push(options.env!)
      // No dependency graph is needed here; exercise the real shim instead of downloading packages.
      const result = crossSpawn.sync(command, args[0] === 'install' ? ['--version'] : args, { ...options, stdio: 'pipe' })
      versions.push(result.stdout?.toString().trim() ?? '')
      return result
    }
    return crossSpawn.sync(command, args, options)
  }) as NonNullable<ReleaseCiOptions['spawn']>
  const github = {
    ensurePullRequest: vi.fn(),
    ensureRelease: vi.fn(async () => ({ id: 1, html_url: '', tag_name: 'a@1.0.1' })),
    ensureTag: vi.fn(),
    listReleases: vi.fn(async () => []),
    readReleaseState: vi.fn(async () => undefined),
    writeReleaseState: vi.fn(async () => 'revision'),
  }
  const env = { ...h.env, GITHUB_REPOSITORY: 'acme/repo', GITHUB_SHA: 'd'.repeat(40), COREPACK_ENABLE_NETWORK: '1' }
  await expect(releaseCi({ ...h.options, mode: 'publish', sourceSha: source, spawn, github, env })).resolves.toEqual([{ name: 'a', version: '1.0.1' }])
  expect(versions).toHaveLength(2)
  expect(versions.every(output => output.split('\n').at(-1) === version)).toBe(true)
  expect(seenEnvironments.every(env => env['GITHUB_SHA'] === 'd'.repeat(40))).toBe(true)
  expect(github.ensureTag).toHaveBeenCalledWith({ tag: 'a@1.0.1', target: source })
  expect(await readFile(path.join(h.cwd, 'package.json'), 'utf8')).toBe(current)
  expect(await readFile(path.join(h.cwd, '.changeset/new.md'), 'utf8')).toContain('Future change')
})
