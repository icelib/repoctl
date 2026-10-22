import type { GitHubOperations, ReleaseCiOptions, ReleaseCompletionRecord } from '@icebreakers/monorepo'
import type { spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'pathe'
import { afterEach, expect, it, vi } from 'vitest'
import { recordReleaseCompletion } from '@/commands/release/completion'
import { completionId, parseReleaseCompletion, readReleaseCompletion } from '@/commands/release/completion/record'
import { resolveReleaseBranches } from '@/commands/release/lines'
import { cleanupReleaseTempRoots, createSpawnMock, createTempWorkspace } from '../release-fixtures'
import { key, source, state } from './checkpoint/fixture'

afterEach(cleanupReleaseTempRoots)

function record() {
  const value: Omit<ReleaseCompletionRecord, 'id'> = {
    schemaVersion: 1,
    repository: 'acme/repo',
    branch: 'main',
    distTag: 'latest',
    sourceSha: 'a'.repeat(40),
    packages: [
      { name: 'core', version: '2.0.0', sourceSha: 'a'.repeat(40) },
      { name: 'dependency', version: '1.0.0', sourceSha: 'b'.repeat(40) },
    ],
    releasedPackages: ['core'],
    checkpointKey: 'c'.repeat(64),
  }
  return { ...value, id: completionId(value) }
}

it('retains historical package provenance alongside the newly released cohort', () => {
  const value = record()
  expect(parseReleaseCompletion(value, value.id)).toEqual(value)
  expect(value.packages[1]?.sourceSha).not.toBe(value.sourceSha)
})

it.each([
  { branch: 'next' },
  { distTag: 'beta' },
  { sourceSha: 'main' },
  { releasedPackages: ['dependency'] },
  { packages: [{ name: 'core', version: '2.0.0-beta.1', sourceSha: 'a'.repeat(40) }] },
])('rejects invalid completion provenance %j', (change) => {
  const value = { ...record(), ...change }
  expect(() => parseReleaseCompletion(value, value.id)).toThrow()
})

it('rejects mutations to a persisted release completion identity', () => {
  const value = record()
  expect(() => parseReleaseCompletion({ ...value, repository: 'another/repo' }, value.id)).toThrow('identity mismatch')
})

it('reads only a validated release record from durable automation state', async () => {
  const value = record()
  const readAutomationState = vi.fn(async () => ({ revision: 'blob', value }))
  const github: GitHubOperations = { ensurePullRequest: vi.fn(), ensureRelease: vi.fn(), readAutomationState }
  expect(await readReleaseCompletion(github, value.id)).toEqual(value)
  expect(readAutomationState).toHaveBeenCalledWith(`releases/${value.id}`)
  await expect(readReleaseCompletion(github, '../main')).rejects.toThrow('valid persisted')
})

it('does not record prerelease or maintenance completions', async () => {
  const github = { ensurePullRequest: vi.fn(), ensureRelease: vi.fn(), writeAutomationState: vi.fn() }
  const rules = resolveReleaseBranches({ maintenance: [{ branch: 'v1', range: '1.x', tag: 'latest-v1' }] })
  for (const rule of rules.filter(item => item.kind !== 'stable')) {
    expect(await recordReleaseCompletion({ cwd: '.', github }, state, key, rule)).toBeUndefined()
  }
  expect(github.writeAutomationState).not.toHaveBeenCalled()
})

it('keeps an unconfigured repository unchanged and rejects incomplete or ambiguous configured releases', async () => {
  const rule = resolveReleaseBranches()[0]!
  const empty = await createTempWorkspace('main')
  expect(await recordReleaseCompletion({ cwd: empty }, state, key, rule)).toBeUndefined()
  const cwd = await createTempWorkspace('main')
  const site = { packages: ['repoctl'], buildScript: 'docs:build', patchPaths: ['docs/**'], preview: { deployScript: 'docs:preview' }, stable: { deployScript: 'docs:stable' } }
  await writeFile(path.join(cwd, 'repoctl.config.mjs'), `export default ${JSON.stringify({ commands: { docs: { sites: { guide: site } } } })}\n`)
  await expect(recordReleaseCompletion({ cwd }, state, key, rule)).rejects.toThrow('complete stable release lifecycle')
  const packages = [{ name: 'a', version: '1.0.0', target: source }, { name: 'b', version: '1.0.0', target: 'c'.repeat(40) }]
  await expect(recordReleaseCompletion({ cwd }, { ...state, complete: true, npm: 'complete', packages, metadata: ['a@1.0.0', 'b@1.0.0'] }, key, rule)).rejects.toThrow('one original source commit')
})

async function publicationFixture() {
  const cwd = await createTempWorkspace('main')
  const site = { packages: ['repoctl'], buildScript: 'docs:build', patchPaths: ['docs/**'], preview: { deployScript: 'docs:preview' }, stable: { deployScript: 'docs:stable' } }
  await writeFile(path.join(cwd, 'repoctl.config.mjs'), `export default ${JSON.stringify({ commands: { docs: { sites: { guide: site } } } })}\n`)
  const candidates = [{ name: 'repoctl', version: '1.0.0' }, { name: 'unreleased', version: '1.0.0' }, { name: 'beta', version: '1.0.0-beta.1' }, { name: 'historical', version: '1.0.0' }]
  for (const { name, version } of candidates.slice(1)) {
    const directory = path.join(cwd, 'packages', name)
    await mkdir(directory)
    await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name, version }))
  }
  const older = 'd'.repeat(40)
  const mock = createSpawnMock({
    stdout: {
      'npm view repoctl@1.0.0 --json': JSON.stringify({ version: '1.0.0', gitHead: source }),
      'npm view historical@1.0.0 --json': JSON.stringify({ version: '1.0.0', gitHead: older }),
      [`git merge-base ${source} ${source}`]: source,
      [`git merge-base ${older} ${source}`]: older,
    },
    statuses: { 'npm view unreleased@1.0.0 --json': 1 },
    stderr: { 'npm view unreleased@1.0.0 --json': 'E404 Not Found' },
  })
  const github: GitHubOperations = {
    ensurePullRequest: vi.fn(),
    ensureRelease: vi.fn(),
    readAutomationState: vi.fn(async () => undefined),
    writeAutomationState: vi.fn(async () => 'record-blob'),
    readTagTarget: async tag => tag === 'repoctl@1.0.0' ? source : tag === 'historical@1.0.0' ? older : undefined,
  }
  const options: ReleaseCiOptions = { cwd, github, spawn: mock.spawn as unknown as typeof spawnSync, sleep: async () => {} }
  const completed = { ...state, candidates, complete: true, npm: 'complete' as const, packages: [{ name: 'repoctl', version: '1.0.0', target: source }], metadata: ['repoctl@1.0.0'] }
  return { options, completed, mock, github, rule: resolveReleaseBranches()[0]! }
}

it('records proven package sources without letting unrelated unpublished or prerelease packages block completion', async () => {
  const h = await publicationFixture()
  const result = await recordReleaseCompletion(h.options, h.completed, key, h.rule)
  expect(result?.record.packages.map(pkg => pkg.name)).toEqual(['historical', 'repoctl'])
  expect(result?.record.releasedPackages).toEqual(['repoctl'])
  expect(h.mock.calls.some(call => call.args.includes('beta@1.0.0-beta.1'))).toBe(false)
  expect(h.github.writeAutomationState).toHaveBeenCalledOnce()
})

it('does not emit a documentation record for subset recovery despite other package publication proof', async () => {
  const h = await publicationFixture()
  const subset = { ...h.completed, candidates: [{ name: 'repoctl', version: '1.0.0' }] }
  expect(await recordReleaseCompletion(h.options, subset, key, h.rule)).toBeUndefined()
  expect(h.github.readAutomationState).not.toHaveBeenCalled()
  expect(h.github.writeAutomationState).not.toHaveBeenCalled()
  // Restoring and completing the full original candidate state enables the docs trigger.
  const result = await recordReleaseCompletion(h.options, h.completed, key, h.rule)
  expect(result?.sites).toEqual(['guide'])
  expect(result?.record.packages.map(pkg => pkg.name)).toEqual(['historical', 'repoctl'])
  expect(h.github.writeAutomationState).toHaveBeenCalledOnce()
})

it('does not treat authentication failure for an unrelated package as missing proof', async () => {
  const h = await publicationFixture()
  const original = h.mock.spawn.getMockImplementation()!
  h.mock.spawn.mockImplementation((command, args, options) => command === 'npm' && args[1] === 'unreleased@1.0.0'
    ? { status: 1, stdout: '', stderr: 'E401 Unauthorized' }
    : original(command, args, options))
  await expect(recordReleaseCompletion(h.options, h.completed, key, h.rule)).rejects.toThrow('authentication failed')
  expect(h.github.writeAutomationState).not.toHaveBeenCalled()
})

it('omits an unrelated package with no common source history', async () => {
  const h = await publicationFixture()
  const original = h.mock.spawn.getMockImplementation()!
  h.mock.spawn.mockImplementation((command, args, options) => command === 'git' && args[1] === 'd'.repeat(40)
    ? { status: 1, stdout: '', stderr: '' }
    : original(command, args, options))
  const result = await recordReleaseCompletion(h.options, h.completed, key, h.rule)
  expect(result?.record.packages.map(pkg => pkg.name)).toEqual(['repoctl'])
  expect(h.github.writeAutomationState).toHaveBeenCalledOnce()
})

it('rejects a released package with no common source history', async () => {
  const h = await publicationFixture()
  const original = h.mock.spawn.getMockImplementation()!
  h.mock.spawn.mockImplementation((command, args, options) => command === 'git' && args[1] === source
    ? { status: 1, stdout: '', stderr: '' }
    : original(command, args, options))
  await expect(recordReleaseCompletion(h.options, h.completed, key, h.rule)).rejects.toThrow('outside the documentation baseline')
  expect(h.github.writeAutomationState).not.toHaveBeenCalled()
})

it.each([128, null])('does not treat a failed ancestry query (%s) as missing proof', async (status) => {
  const h = await publicationFixture()
  const original = h.mock.spawn.getMockImplementation()!
  h.mock.spawn.mockImplementation((command, args, options) => command === 'git' && args[1] === 'd'.repeat(40)
    ? { status, stdout: '', stderr: 'fatal: cannot inspect ancestry' } as ReturnType<typeof original>
    : original(command, args, options))
  await expect(recordReleaseCompletion(h.options, h.completed, key, h.rule)).rejects.toThrow('Cannot inspect published source ancestry')
  expect(h.github.writeAutomationState).not.toHaveBeenCalled()
})
