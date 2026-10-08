import type { ReleaseCiOptions } from '@icebreakers/monorepo'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import crossSpawn from 'cross-spawn'
import { afterEach, vi } from 'vitest'
import { fixture } from '../plan/fixture'

const suffixes = ['darwin-arm64', 'darwin-x64', 'linux-arm64-gnu', 'linux-arm64-musl', 'linux-x64-gnu', 'linux-x64-musl', 'win32-arm64-msvc', 'win32-x64-msvc']
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(cwd => rm(cwd, { recursive: true, force: true })))
})

export async function versionOnlyFixture(locale: 'en' | 'zh-CN') {
  const nativeNames = suffixes.map(suffix => `@fixture/native-${suffix}`)
  const h = await fixture({ registryPackages: nativeNames })
  roots.push(h.cwd)
  await rm(path.join(h.cwd, '.pnpmfile.cjs'))
  await rm(path.join(h.cwd, 'packages', 'b'), { recursive: true })
  h.git('config', 'commit.gpgsign', 'false')
  for (const name of ['a', 'consumer', 'private-lib']) {
    await h.write(`packages/${name}/package.json`, JSON.stringify({ name, version: '1.0.0', ...(name === 'private-lib' ? { private: true } : {}) }))
  }
  for (const suffix of suffixes) {
    const [os, cpu] = suffix.split('-')
    await h.write(`packages-native/${suffix}/package.json`, JSON.stringify({ name: `@fixture/native-${suffix}`, version: '1.0.0', os: [os], cpu: [cpu] }))
  }
  await h.write('pnpm-workspace.yaml', `packages:\n  - packages/*\n  - packages-native/*\nversioning:\n  fixed:\n    - ${JSON.stringify(['a', ...nativeNames])}\n  changelog:\n    storage: repository\n`)
  await h.write('.changeset/test.md', '---\na: minor\n---\n新增可选 Rust 内核。\n')
  h.git('add', '.')
  h.git('commit', '-qm', 'feat: add optional Rust kernel')
  const source = h.git('rev-parse', 'HEAD')
  const github = {
    ensurePullRequest: vi.fn<NonNullable<ReleaseCiOptions['github']>['ensurePullRequest']>(),
    ensureRelease: vi.fn<NonNullable<ReleaseCiOptions['github']>['ensureRelease']>(),
    enrichReleaseNote: vi.fn<NonNullable<NonNullable<ReleaseCiOptions['github']>['enrichReleaseNote']>>(async document => document),
  }
  const pushes: string[][] = []
  const applied: Array<{ name: string, currentVersion: string, newVersion: string }> = []
  const spawn: NonNullable<ReleaseCiOptions['spawn']> = ((command: string, args: string[], options: never) => {
    if (command === 'git' && args[0] === 'push') {
      pushes.push(args)
      return { status: 0, stdout: '', stderr: '' }
    }
    const result = crossSpawn.sync(command, args, options)
    if (command === 'pnpm' && args[0] === 'version' && !args.includes('--dry-run') && result.status === 0) {
      applied.push(...JSON.parse(String(result.stdout)))
    }
    return result
  }) as NonNullable<ReleaseCiOptions['spawn']>
  const options: ReleaseCiOptions = {
    cwd: h.cwd,
    branch: 'main',
    mode: 'prepare',
    env: { ...h.env, REPOCTL_LANG: locale, GITHUB_REPOSITORY: 'fixture/repo' },
    config: { qualityScripts: [] },
    spawn,
    github,
  }
  return { ...h, nativeNames, source, applied, pushes, github, options }
}
