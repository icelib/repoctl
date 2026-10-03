import { existsSync } from 'node:fs'
import { symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createSnapshotPlan, releaseSnapshot } from '@icebreakers/monorepo'
import crossSpawn from 'cross-spawn'
import { expect, it } from 'vitest'
import { fixture, snapshot } from './fixture'

it('previews native candidates with exact deterministic PR/nightly identities without source changes', async () => {
  const h = await fixture()
  const before = await snapshot(h.cwd)
  const plan = await releaseSnapshot({ ...h.options, dryRun: true, publish: true, env: { ...h.options.env, REPOCTL_SNAPSHOT_PUBLISH: '0' } })
  expect(plan.status).toBe('planned')
  expect(plan.outputDirectory).toBeUndefined()
  expect(plan.tag).toBe('snapshot-pr-12')
  expect(plan.packages.map(pkg => pkg.name)).toEqual(['snapshot-a', 'snapshot-b'])
  expect(plan.packages[0]?.reasons).toContain('intent')
  expect(plan.packages.every(pkg => pkg.version.includes(h.options.identity.commit))).toBe(true)
  expect((await createSnapshotPlan(h.options)).packages).toEqual(plan.packages)
  const nightly = await createSnapshotPlan({ ...h.options, identity: { ...h.options.identity, kind: 'nightly', buildId: '2026-10-03-run-2' } })
  expect(nightly.tag).toBe('snapshot-nightly')
  expect(nightly.packages[0]?.version).not.toBe(plan.packages[0]?.version)
  const cli = crossSpawn.sync(process.execPath, [path.resolve(import.meta.dirname, '../../../../bin/repo.js'), 'release', 'snapshot', '--kind', 'pr', '--pr', '12', '--commit', h.options.identity.commit, '--build-id', h.options.identity.buildId, '--dry-run', '--json'], { cwd: h.cwd, env: h.options.env, encoding: 'utf8' })
  expect(cli.status, cli.stderr).toBe(0)
  expect(JSON.parse(cli.stdout).identityKey).toBe(plan.identityKey)
  expect(await snapshot(h.cwd)).toEqual(before)
})

it('rejects dirty sources, malformed identities and output under the source before mutation', async () => {
  const h = await fixture()
  await expect(createSnapshotPlan({ ...h.options, identity: { ...h.options.identity, commit: 'abc' } })).rejects.toThrow('full lowercase commit')
  await expect(createSnapshotPlan({ ...h.options, identity: { ...h.options.identity, commit: 'a'.repeat(40) } })).rejects.toThrow('HEAD')
  const before = await snapshot(h.cwd)
  const inside = await releaseSnapshot({ ...h.options, outputDirectory: path.join(h.cwd, 'artifacts') })
  expect(inside.status).toBe('failed')
  expect(inside.error).toContain('outside the source')
  const link = path.join(h.root, 'output-link')
  await symlink(h.cwd, link, 'junction')
  const linked = await releaseSnapshot({ ...h.options, outputDirectory: path.join(link, 'artifacts') })
  expect(linked.status).toBe('failed')
  expect(linked.error).toContain('outside the source')
  expect(await snapshot(h.cwd)).toEqual(before)
  await h.write('UNCOMMITTED', 'work')
  await expect(createSnapshotPlan(h.options)).rejects.toThrow('clean committed source')
})

it('keeps snapshot planning independent of executable release configuration and rejects escaping workspace patterns', async () => {
  const h = await fixture()
  await h.write('repoctl.config.mjs', 'throw new Error("Snapshot must not load stable release configuration")')
  h.run('git', ['add', '.'])
  h.run('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'unrelated config'])
  const options = { ...h.options, identity: { ...h.options.identity, commit: h.run('git', ['rev-parse', 'HEAD']) } }
  expect((await createSnapshotPlan(options)).status).toBe('planned')
  await h.write('pnpm-workspace.yaml', 'packages:\n  - packages/*\n  - ../outside/*\nversioning:\n  changelog:\n    storage: repository\n')
  h.run('git', ['add', '.'])
  h.run('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'outside workspace pattern'])
  await expect(createSnapshotPlan({ ...options, identity: { ...options.identity, commit: h.run('git', ['rev-parse', 'HEAD']) } })).rejects.toThrow('inside the source')
})

it('never executes release configuration from the built snapshot CLI while ordinary release commands validate it', async () => {
  const h = await fixture()
  const marker = path.join(h.root, 'config-executed')
  await h.write('repoctl.config.mjs', `import { writeFileSync } from 'node:fs'
writeFileSync(new URL('../config-executed', import.meta.url), 'executed')
throw new Error('Snapshot must not execute stable release configuration')`)
  h.run('git', ['add', '.'])
  h.run('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'unrelated executable config'])
  const commit = h.run('git', ['rev-parse', 'HEAD'])
  const before = await snapshot(h.cwd)
  const cli = path.resolve(import.meta.dirname, '../../../../bin/repo.js')
  const result = crossSpawn.sync(process.execPath, [cli, 'release', 'snapshot', '--kind', 'pr', '--pr', '12', '--commit', commit, '--build-id', h.options.identity.buildId, '--dry-run', '--json'], { cwd: h.cwd, env: h.options.env, encoding: 'utf8' })
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toMatchObject({ status: 'planned', identity: { commit } })
  expect(existsSync(marker)).toBe(false)
  expect(await snapshot(h.cwd)).toEqual(before)

  const ordinary = crossSpawn.sync(process.execPath, [cli, 'release', 'plan', '--json'], { cwd: h.cwd, env: h.options.env, encoding: 'utf8' })
  expect(ordinary.status).toBe(1)
  expect(JSON.parse(ordinary.stderr)).toMatchObject({ valid: false, diagnostics: [{ id: 'config.load-failed' }] })
  expect(existsSync(marker)).toBe(true)
  expect(await snapshot(h.cwd)).toEqual(before)
})

it('rejects unauthorized, fork and pull_request_target publishers before installation or upload', async () => {
  const h = await fixture()
  await expect(releaseSnapshot({ ...h.options, publish: true, env: { ...h.options.env, REPOCTL_SNAPSHOT_PUBLISH: '0' } })).rejects.toThrow('REPOCTL_SNAPSHOT_PUBLISH')
  await writeFile(h.env.GITHUB_EVENT_PATH, JSON.stringify({ ...h.event, pull_request: { ...h.event.pull_request, head: { ...h.event.pull_request.head, repo: { fork: true, full_name: 'outsider/repo' } } } }))
  await expect(releaseSnapshot({ ...h.options, publish: true })).rejects.toThrow('fork')
  await expect(releaseSnapshot({ ...h.options, publish: true, env: { ...h.options.env, GITHUB_EVENT_NAME: 'pull_request_target' } })).rejects.toThrow('pull_request_target')
  expect(h.uploads).toEqual([])
})
