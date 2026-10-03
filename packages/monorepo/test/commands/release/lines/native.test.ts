import { readFile } from 'node:fs/promises'
import { createReleasePlan, enterPrerelease, exitPrerelease, prepareStable, releaseCi } from '@icebreakers/monorepo'
import path from 'pathe'
import { expect, it, vi } from 'vitest'
import { cli, snapshot } from '../plan/fixture'
import { branches, lineFixture } from './fixture'

it('plans a maintenance patch with native pnpm and preserves every input', async () => {
  const h = await lineFixture()
  const before = await snapshot(h.cwd)
  const report = await createReleasePlan(h.options)
  expect(report.status, JSON.stringify(report.blockers)).toBe('ready')
  expect(report.branchRule).toMatchObject({ branch: '1.x', lane: 'main', range: '1.x', distTag: 'legacy-1' })
  expect(report.packages.find(pkg => pkg.name === 'a')?.newVersion).toBe('1.0.1')
  const result = cli(h.cwd, ['--branch', '1.x', '--json'], h.env)
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toEqual(report)
  expect(await snapshot(h.cwd)).toEqual(before)
})

it('blocks a maintenance major and stable overlap before hooks, intents or manifests change', async () => {
  const h = await lineFixture('major')
  const before = await snapshot(h.cwd)
  const config = { ...h.options.config, hooks: { beforeVersion: ['must-not-run'] } }
  const plan = await createReleasePlan(h.options)
  expect(plan.status).toBe('blocked')
  expect(plan.blockers[0]?.detail).toContain('outside release line 1.x')
  await expect(prepareStable({ ...h.options, config })).rejects.toThrow('outside release line 1.x')
  expect(await snapshot(h.cwd)).toEqual(before)

  await h.write('.changeset/test.md', '---\na: patch\n---\nKeep the old major.\n')
  const stableBefore = await snapshot(h.cwd)
  await expect(prepareStable({ ...h.options, branch: 'master', config })).rejects.toThrow('outside release line master')
  expect(await snapshot(h.cwd)).toEqual(stableBefore)
})

it.each(['master', '1.x'])('prepares a native release PR against %s with a distinct head', async (branch) => {
  const h = await lineFixture(branch === 'master' ? 'major' : 'patch')
  if (branch === 'master') {
    await h.write('pnpm-workspace.yaml', 'packages: [packages/*]\nversioning:\n  fixed: [[a, b, consumer]]\n  changelog:\n    storage: repository\n')
  }
  const native = h.options.spawn!
  const pushes: string[][] = []
  const spawn: typeof native = ((command: string, args: string[], options: never) => {
    if (command === 'git' && args[0] === 'push') {
      pushes.push(args)
      return { status: 0, stdout: '', stderr: '' }
    }
    return native(command, args, options)
  }) as typeof native
  const github = { ensurePullRequest: vi.fn(), ensureRelease: vi.fn() }
  await releaseCi({ ...h.options, branch, spawn, github, mode: 'prepare' })
  const head = branch === 'master' ? 'release/pnpm-version' : 'release/pnpm-version-1.x'
  expect(github.ensurePullRequest).toHaveBeenCalledWith(expect.objectContaining({ base: branch, head }))
  expect(github.ensurePullRequest).toHaveBeenCalledWith(expect.objectContaining({ body: expect.stringContaining('Version-only release; no package-specific changelog entries.') }))
  expect(pushes).toEqual([['push', '--force', 'origin', `HEAD:${head}`]])
  const version = JSON.parse(await readFile(path.join(h.cwd, 'packages/a/package.json'), 'utf8')).version
  expect(version).toBe(branch === 'master' ? '2.0.0' : '1.0.1')
  expect((await createReleasePlan({ ...h.options, branch })).status).toBe('empty')
})

it('uses the declared prerelease lane and returns its maintenance target without checking out Git', async () => {
  const h = await lineFixture()
  await enterPrerelease('beta', h.options)
  const plan = await createReleasePlan({ ...h.options, branch: 'preview/1.x' })
  expect(plan.status, JSON.stringify(plan.blockers)).toBe('ready')
  expect(plan.packages.find(pkg => pkg.name === 'a')?.newVersion).toMatch(/^1\.0\.1-beta\./)
  const beforeBranch = h.git('branch', '--show-current')
  await expect(exitPrerelease({ ...h.options, branch: 'preview/1.x' })).resolves.toEqual({ branch: '1.x', lane: 'main' })
  expect(h.git('branch', '--show-current')).toBe(beforeBranch)
  expect((await createReleasePlan(h.options)).status).toBe('ready')
})

it('rejects invalid branch configuration before invoking native pnpm', async () => {
  const h = await lineFixture()
  const spawn = vi.fn()
  const result = await createReleasePlan({ ...h.options, spawn, config: { branches: { ...branches, stable: '1.x' } } })
  expect(result.status).toBe('blocked')
  expect(spawn).not.toHaveBeenCalled()
})

it('checks unchanged public packages before consuming an otherwise valid maintenance patch', async () => {
  const h = await lineFixture()
  await h.write('packages/consumer/package.json', '{"name":"consumer","version":"2.0.0"}')
  const before = await snapshot(h.cwd)
  const report = await createReleasePlan(h.options)
  expect(report.status).toBe('blocked')
  expect(report.blockers[0]?.detail).toContain('consumer@2.0.0 is outside release line 1.x')
  await expect(prepareStable(h.options)).rejects.toThrow('consumer@2.0.0 is outside release line 1.x')
  expect(await snapshot(h.cwd)).toEqual(before)
})
