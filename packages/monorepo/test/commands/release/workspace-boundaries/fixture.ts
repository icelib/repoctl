import type { ReleaseCiOptions, ReleasePlan } from '@icebreakers/monorepo'
import { readFile, rm } from 'node:fs/promises'
import crossSpawn from 'cross-spawn'
import path from 'pathe'
import { afterEach, expect, vi } from 'vitest'
import { fixture } from '../plan/fixture'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(cwd => rm(cwd, { recursive: true, force: true })))
})

export async function workspaceFixture(options: { privateRoot?: boolean, removeNotes?: string[] } = {}) {
  const h = await fixture()
  roots.push(h.cwd)
  await rm(path.join(h.cwd, '.pnpmfile.cjs'))
  h.git('config', 'commit.gpgsign', 'false')
  const rootManifest = JSON.parse(await readFile(path.join(h.cwd, 'package.json'), 'utf8'))
  await h.write('package.json', JSON.stringify({
    ...rootManifest,
    name: 'root-pkg',
    version: '1.0.0',
    private: options.privateRoot ?? true,
    scripts: { 'release:notes': 'node release-notes.cjs' },
  }))
  for (const name of ['a', 'b', 'consumer', 'private-lib']) {
    const filename = `packages/${name}/package.json`
    const manifest = JSON.parse(await readFile(path.join(h.cwd, filename), 'utf8'))
    delete manifest.scripts
    if (name === 'private-lib' || name === 'consumer') {
      manifest.dependencies = { a: 'workspace:*' }
    }
    await h.write(filename, JSON.stringify(manifest))
  }
  await h.write('release-notes.cjs', `
const fs = require('node:fs');
for (const directory of ${JSON.stringify(options.removeNotes ?? [])}) {
  fs.rmSync(require('node:path').join(directory, 'CHANGELOG.md'), {force: true});
}
`)
  h.git('add', '.')
  h.git('commit', '-qm', 'configure release workspace boundaries')
  const github = {
    ensurePullRequest: vi.fn<NonNullable<ReleaseCiOptions['github']>['ensurePullRequest']>(),
    ensureRelease: vi.fn<NonNullable<ReleaseCiOptions['github']>['ensureRelease']>(),
  }
  const pushes: string[][] = []
  const applied: Array<{ name: string, currentVersion: string, newVersion: string }> = []
  const spawn: NonNullable<ReleaseCiOptions['spawn']> = ((command: string, args: string[], spawnOptions: never) => {
    if (command === 'git' && args[0] === 'push') {
      pushes.push(args)
      return { status: 0, stdout: '', stderr: '' }
    }
    const result = crossSpawn.sync(command, args, spawnOptions)
    if (command === 'pnpm' && args[0] === 'version' && !args.includes('--dry-run') && result.status === 0) {
      applied.push(...JSON.parse(String(result.stdout)))
    }
    return result
  }) as NonNullable<ReleaseCiOptions['spawn']>
  const releaseOptions: ReleaseCiOptions = {
    cwd: h.cwd,
    branch: 'main',
    env: { ...h.env, GITHUB_EVENT_NAME: 'push', REPOCTL_LANG: 'en' },
    spawn,
    github,
    config: { qualityScripts: [], hooks: { afterVersion: ['release:notes'] } },
  }
  return { ...h, options: releaseOptions, applied, github, pushes }
}

export async function expectAppliedPlan(h: Awaited<ReturnType<typeof workspaceFixture>>, plan: ReleasePlan) {
  expect(h.applied.toSorted((left, right) => left.name.localeCompare(right.name))).toEqual(plan.packages.map(pkg => ({
    name: pkg.name,
    currentVersion: pkg.currentVersion,
    newVersion: pkg.newVersion,
  })))
  for (const pkg of plan.packages) {
    const manifest = JSON.parse(await readFile(path.join(h.cwd, pkg.directory, 'package.json'), 'utf8'))
    expect(manifest.version).toBe(pkg.newVersion)
  }
}
