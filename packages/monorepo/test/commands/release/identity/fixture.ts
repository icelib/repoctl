import type { ReleaseCiOptions } from '@icebreakers/monorepo'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { releaseCi } from '@icebreakers/monorepo'
import path from 'pathe'

const roots: string[] = []
export const packageName = 'identity-package'
export const manifestFile = 'packages/identity/package.json'
export const changelogFile = 'packages/identity/CHANGELOG.md'
export const ledgerFile = '.changeset/ledger.yaml'

export async function cleanupIdentityFixtures() {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
}

export async function createIdentityFixture() {
  const cwd = await mkdtemp(path.join(tmpdir(), 'release-identity-'))
  roots.push(cwd)
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HUSKY: '0',
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.invalid',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.invalid',
    GITHUB_REPOSITORY: 'acme/repo',
  }
  delete env['REPO_RELEASE_SOURCE_SHA']
  delete env['REPO_RELEASE_RECOVERY_SOURCE_SHA']
  const git = (...args: string[]) => {
    const result = spawnSync('git', [
      '-c',
      'commit.gpgsign=false',
      '-c',
      'maintenance.auto=false',
      '-c',
      'gc.auto=0',
      '-c',
      `core.hooksPath=${path.join(cwd, '.git/no-hooks')}`,
      ...args,
    ], { cwd, env, encoding: 'utf8' })
    if (result.status !== 0) {
      throw new Error(result.stderr)
    }
    return result.stdout.trim()
  }
  const write = async (file: string, content: string) => {
    await mkdir(path.dirname(path.join(cwd, file)), { recursive: true })
    await writeFile(path.join(cwd, file), content)
  }
  const manifest = (version = '1.0.0', extra = {}) => write(manifestFile, JSON.stringify({ name: packageName, version, ...extra }))
  const ledger = (version = '1.0.0', extra = '') => write(ledgerFile, `${packageName}@${version}:\n  dir: packages/identity\n  intents: [initial]\n${extra}`)
  const commit = (message: string) => {
    git('add', '--all')
    git('commit', '-m', message)
    return git('rev-parse', 'HEAD')
  }
  await write('package.json', JSON.stringify({ private: true }))
  await write('pnpm-workspace.yaml', 'packages:\n  - packages/*\n')
  await write(ledgerFile, '{}\n')
  await manifest()
  git('init', '-b', 'main')
  const initial = commit('initial package')

  const calls: string[] = []
  const spawn = ((command: string, args: string[], options: Parameters<typeof spawnSync>[2]) => {
    calls.push(`${command} ${args.join(' ')}`)
    if (command === 'npm' && args[0] === 'view') {
      return { status: 1, stdout: '', stderr: 'E404 Not Found' }
    }
    if (command !== 'git') {
      throw new Error(`Unexpected command in dry-run: ${command} ${args.join(' ')}`)
    }
    return spawnSync(command, args, options)
  }) as NonNullable<ReleaseCiOptions['spawn']>
  const mutation = async (): Promise<never> => {
    throw new Error('Dry-run must not mutate remote release state')
  }
  const inspect = (expectedSource: string, overrides: Partial<ReleaseCiOptions> = {}) => releaseCi({
    cwd,
    env,
    spawn,
    config: { qualityScripts: [] },
    branch: 'main',
    mode: 'publish',
    dryRun: true,
    github: {
      ensurePullRequest: mutation,
      ensureRelease: mutation,
      ensureTag: mutation,
      writeReleaseState: mutation,
      listReleases: async () => [],
      readReleaseState: async () => undefined,
      // The lifecycle rejects a discovered source that differs from this tag.
      readTagTarget: async () => expectedSource,
    },
    ...overrides,
  })
  const shallow = async () => {
    const cloneRoot = await mkdtemp(path.join(tmpdir(), 'release-identity-shallow-'))
    roots.push(cloneRoot)
    const clone = path.join(cloneRoot, 'checkout')
    git('clone', '--depth', '1', pathToFileURL(cwd).href, clone)
    return clone
  }
  return { cwd, env, git, write, manifest, ledger, commit, initial, calls, inspect, shallow }
}
