import type { MaintenanceUpgradeOptions } from '@icebreakers/monorepo'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach } from 'vitest'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

export const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
export const lockfile = (version: string, extra = '') => `lockfileVersion: '9.0'\nimporters:\n  .:\n    devDependencies:\n      repoctl:\n        specifier: ${version}\n        version: ${version}\n${extra}`

export async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'repoctl-maintenance-'))
  roots.push(root)
  const cwd = path.join(root, 'source')
  await mkdir(cwd)
  const gitBytes = (args: string[], directory = cwd) => execFileSync('git', args, { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] })
  const git = (args: string[], directory = cwd) => gitBytes(args, directory).toString('utf8').trim()
  const write = async (filename: string, content: string) => {
    await mkdir(path.dirname(path.join(cwd, filename)), { recursive: true })
    await writeFile(path.join(cwd, filename), content)
  }
  git(['init', '-q', '-b', 'main'])
  git(['config', 'user.name', 'Fixture'])
  git(['config', 'user.email', 'fixture@example.com'])
  const repoctlRoot = fileURLToPath(new URL('../../../../repoctl/', import.meta.url))
  const version = JSON.parse(await readFile(path.join(repoctlRoot, 'package.json'), 'utf8')).version
  await write('.gitignore', 'node_modules\n')
  await write('package.json', `${JSON.stringify({ name: 'maintenance-fixture', private: true, scripts: { build: 'node -e ""', lint: 'node -e ""', typecheck: 'node -e ""', tsd: 'node -e ""', test: 'node -e ""' }, devDependencies: { repoctl: '0.1.0' } }, null, 2)}\n`)
  await write('pnpm-workspace.yaml', 'packages: []\n')
  await write('repoctl.config.mjs', 'export default {commands:{upgrade:{targets:[".editorconfig"],mergeTargets:false}}}\n')
  await write('pnpm-lock.yaml', lockfile('0.1.0'))
  git(['add', '.'])
  git(['-c', 'commit.gpgsign=false', 'commit', '-qm', 'base'])
  const base = git(['rev-parse', 'HEAD'])
  const manifest = JSON.parse(await readFile(path.join(cwd, 'package.json'), 'utf8'))
  manifest.devDependencies.repoctl = version
  await write('package.json', `${JSON.stringify(manifest, null, 2)}\n`)
  await write('pnpm-lock.yaml', lockfile(version))
  git(['add', '.'])
  git(['-c', 'commit.gpgsign=false', 'commit', '-qm', 'update repoctl'])
  const head = git(['rev-parse', 'HEAD'])
  await mkdir(path.join(cwd, 'node_modules'))
  await symlink(repoctlRoot, path.join(cwd, 'node_modules/repoctl'), process.platform === 'win32' ? 'junction' : 'dir')
  const calls: string[][] = []
  const spawn: NonNullable<MaintenanceUpgradeOptions['spawn']> = ((command: string, args: string[]) => {
    calls.push([command, ...args])
    return { status: 0, signal: null, error: undefined, stdout: 'fixture validation passed', stderr: '', pid: 1, output: [null, '', ''] }
  }) as unknown as NonNullable<MaintenanceUpgradeOptions['spawn']>
  const options: MaintenanceUpgradeOptions = { cwd, base, head, outputDirectory: path.join(root, 'artifact'), spawn, env: { ...process.env, GITHUB_REPOSITORY: 'acme/example', GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1' } }
  const expected = { repository: 'acme/example', coordinates: { owner: 'acme', repo: 'example' }, defaultBranch: 'main', head, base, runId: '123', runAttempt: '1', artifactId: '456', artifactDigest: 'a'.repeat(64), appConfigured: true, targets: ['.editorconfig'] }
  const request = async (route: string) => ({ data: route.endsWith('/branches/{branch}') ? { commit: { sha: head } } : route.endsWith('/actions/artifacts/{artifact_id}') ? { id: 456, name: 'repoctl-maintenance-123-1', expired: false, digest: `sha256:${'a'.repeat(64)}`, workflow_run: { id: 123, head_sha: head } } : { full_name: expected.repository, default_branch: 'main' } })
  return { root, cwd, git, gitBytes, write, base, head, version, calls, spawn, options, expected, request }
}
