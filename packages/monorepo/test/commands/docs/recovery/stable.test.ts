import { readFileSync } from 'node:fs'
import path from 'node:path'
import { deployDocs, planDocsDeployment } from '@icebreakers/monorepo'
import { afterEach, expect, it } from 'vitest'
import { cleanup, commit, fixture, makeRecord, put } from '../helpers'
import { loseUpload, runner } from './helpers'

afterEach(cleanup)

it('freezes configuration and uses the same build, deploy script and URL after main changes', async () => {
  const { cwd, options, store } = await fixture()
  const before = await planDocsDeployment(options)
  await loseUpload(options)
  const changed = structuredClone(options.config)!
  changed.sites!['website'] = {
    ...changed.sites!['website']!,
    packages: ['unreleased-package'],
    buildScript: 'new:build',
    patchPaths: [],
    preview: { deployScript: 'new:preview', url: 'https://changed-preview.example.invalid' },
    stable: { deployScript: 'new:stable', url: 'https://changed-stable.example.invalid' },
  }
  await put(cwd, 'repoctl.config.json', JSON.stringify({ commands: { docs: changed } }))
  await put(cwd, 'packages/core/src/index.ts', 'export const value = "unreleased"\n')
  commit(cwd)
  const retryOptions = { ...options, config: changed }
  const writes = store.writes.length
  expect(await planDocsDeployment(retryOptions)).toMatchObject({
    deploymentId: before.deploymentId,
    sourceSha: before.sourceSha,
    treeSha: before.treeSha,
    eligible: true,
  })
  expect(store.writes).toHaveLength(writes)
  const retry = runner((args, source, env) => {
    if (args[0] === 'install') {
      expect(Object.keys(env).filter(key => key.startsWith('REPO_DOCS_'))).toEqual([])
    }
    else {
      expect(env['REPO_DOCS_URL']).toBe('https://docs.example.invalid')
      expect(env['REPO_DOCS_DEPLOYMENT_ID']).toBe(before.deploymentId)
    }
    expect(readFileSync(path.join(source, 'packages/core/src/index.ts'), 'utf8')).toContain('"released"')
  })
  expect((await deployDocs({ ...retryOptions, spawn: retry.spawn })).status).toBe('deployed')
  expect(retry.calls).toEqual([
    ['pnpm', 'install', '--frozen-lockfile'],
    ['pnpm', 'run', 'docs:build'],
    ['pnpm', 'run', 'docs:stable'],
  ])
  expect(store.records.get('docs/website/stable')!.value).toHaveProperty('current.deploymentId', before.deploymentId)
  expect(store.records.get('docs/website/stable')!.value).not.toHaveProperty('pending')
})

it('recovers the first stable deployment without current config or a current pointer', async () => {
  const { cwd, options, store } = await fixture()
  await loseUpload(options)
  await put(cwd, 'repoctl.config.json', JSON.stringify({ commands: { docs: { sites: {} } } }))
  commit(cwd)
  expect(store.records.get('docs/website/stable')!.value).not.toHaveProperty('current')
  const { release: _release, config: _config, ...retryOptions } = options
  expect(await planDocsDeployment(retryOptions)).toMatchObject({ releaseId: options.release, eligible: true })
  expect((await deployDocs({ ...retryOptions, spawn: runner().spawn })).status).toBe('deployed')
  await expect(planDocsDeployment(retryOptions)).rejects.toThrow('not configured')
})

it('replays existing and requested corrections when retrying the current baseline without release', async () => {
  const { cwd, options, store } = await fixture()
  await put(cwd, 'website/first.md', '# First correction\n')
  const first = commit(cwd)
  await deployDocs({ ...options, commits: [first], spawn: runner().spawn })
  await put(cwd, 'website/second.md', '# Second correction\n')
  const second = commit(cwd)
  const { release: _release, ...current } = options
  const correction = { ...current, commits: [second] }
  await loseUpload(correction)
  const retryOptions = { ...correction, config: { sites: {} } }
  expect(await planDocsDeployment(retryOptions)).toMatchObject({ releaseId: options.release, commits: [first, second], eligible: true })
  const retry = runner((_args, source) => {
    expect(readFileSync(path.join(source, 'website/first.md'), 'utf8')).toContain('First correction')
    expect(readFileSync(path.join(source, 'website/second.md'), 'utf8')).toContain('Second correction')
  })
  await deployDocs({ ...retryOptions, spawn: retry.spawn })
  expect(store.records.get('docs/website/stable')!.value).toHaveProperty('current.commits', [first, second])
})

it('blocks different correction requests and preserves the interrupted deployment', async () => {
  const { cwd, options, store } = await fixture()
  await put(cwd, 'website/correction.md', '# Correction\n')
  const correction = commit(cwd)
  await loseUpload({ ...options, commits: [correction] })
  const saved = structuredClone(store.records.get('docs/website/stable'))
  const retry = runner()
  await expect(deployDocs({ ...options, config: { sites: {} }, spawn: retry.spawn })).rejects.toMatchObject({ report: { failedStage: 'plan' } })
  expect(retry.calls).toEqual([])
  expect(store.records.get('docs/website/stable')).toEqual(saved)
})

it('does not interpret an omitted release as a pending newer release when a current baseline exists', async () => {
  const { cwd, options, store } = await fixture()
  await deployDocs({ ...options, spawn: runner().spawn })
  await put(cwd, 'website/new-release.md', '# New release\n')
  const record = makeRecord(commit(cwd))
  await store.github.writeAutomationState(`releases/${record.id}`, record)
  await loseUpload({ ...options, release: record.id })
  const { release: _release, ...omitted } = options
  await expect(planDocsDeployment(omitted)).rejects.toMatchObject({ reason: 'deployment-unresolved' })
  expect((await deployDocs({ ...options, release: record.id, config: { sites: {} }, spawn: runner().spawn })).status).toBe('deployed')
})
