import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { createSnapshotPlan } from '@icebreakers/monorepo'
import { expect, it } from 'vitest'
import { sourceFixture } from './fixture'

it('rejects every gitlink by default and records only exact explicitly allowed tree entries', async () => {
  const h = await sourceFixture(true)
  await expect(createSnapshotPlan(h.options)).rejects.toThrow('do not support Git submodules')
  const report = await createSnapshotPlan({ ...h.options, referenceGitlinks: ['references/tooling'] })
  expect(report.sourceTree).toBe(h.tree)
  expect(report.referenceGitlinks).toEqual([{ path: 'references/tooling', commit: h.run('git', ['rev-parse', `${h.commit}^`]) }])
  expect(h.run('git', ['status', '--porcelain'])).toBe('')
})

it.each([
  ['references/absent'],
  ['references/tooling', 'references/tooling'],
  ['../outside'],
  ['/absolute'],
  ['C:\\outside'],
  ['references\\tooling'],
  ['references/./tooling'],
  ['.git/objects'],
])('rejects malformed, duplicate and non-gitlink reference declarations: %j', async (...referenceGitlinks) => {
  const h = await sourceFixture(true)
  await expect(createSnapshotPlan({ ...h.options, referenceGitlinks })).rejects.toThrow(/referenceGitlinks|relative paths/u)
})

it('does not accept a partial allowlist or local dependencies entering an omitted reference', async () => {
  const h = await sourceFixture(true)
  await mkdir(path.join(h.cwd, 'references/another'), { recursive: true })
  h.run('git', ['update-index', '--add', '--cacheinfo', '160000', h.commit, 'references/another'])
  h.run('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'second reference'])
  const commit = h.run('git', ['rev-parse', 'HEAD'])
  const options = { ...h.options, identity: { ...h.options.identity, commit } }
  await expect(createSnapshotPlan({ ...options, referenceGitlinks: ['references/tooling'] })).rejects.toThrow('references/another')
  const manifest = JSON.parse(await readFile(path.join(h.cwd, 'packages/a/package.json'), 'utf8'))
  await h.write('packages/a/package.json', JSON.stringify({ ...manifest, dependencies: { reference: 'file:../../references/tooling/consumer' } }))
  h.run('git', ['add', 'packages/a/package.json'])
  h.run('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'reference dependency'])
  await expect(createSnapshotPlan({ ...options, identity: { ...options.identity, commit: h.run('git', ['rev-parse', 'HEAD']) }, referenceGitlinks: ['references/tooling', 'references/another'] })).rejects.toThrow('cannot use omitted reference gitlink')
})
