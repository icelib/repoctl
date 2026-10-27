import type { SnapshotPreparationResult } from '@icebreakers/monorepo'
import { mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { releaseSnapshot } from '@icebreakers/monorepo'
import { expect, it } from 'vitest'
import { sha256, sourceFixture } from './fixture'

it.each(['package.json', 'packages/a/index.js'])('rejects callback mutation of existing %s before building', async (file) => {
  const h = await sourceFixture()
  const report = await releaseSnapshot({ ...h.options, prepareSource: async ({ directory }) => {
    await writeFile(path.join(directory, ...file.split('/')), '{}')
    return { files: [] }
  } })
  expect(report.status).toBe('failed')
  expect(report.error).toContain('changed an existing source file')
  expect(h.uploads).toEqual([])
}, 120_000)

it('rejects deletion of existing source before building', async () => {
  const h = await sourceFixture()
  const report = await releaseSnapshot({ ...h.options, prepareSource: async ({ directory }) => {
    await rm(path.join(directory, 'packages/a/index.js'))
    return { files: [] }
  } })
  expect(report.status).toBe('failed')
  expect(report.error).toContain('changed an existing source file')
  expect(h.uploads).toEqual([])
}, 120_000)

it.each([
  undefined,
  null,
  {},
  { files: 'not-an-array' },
  { files: [], unexpected: true },
  { files: [], metadata: [] },
  { files: [], metadata: { producer: 42 } },
])('rejects malformed receipt or metadata %j before building', async (receipt) => {
  const h = await sourceFixture()
  const report = await releaseSnapshot({ ...h.options, prepareSource: async () => receipt as SnapshotPreparationResult })
  expect(report.status).toBe('failed')
  expect(report.error).toMatch(/complete files receipt|only string values/u)
  expect(report.preparation).toBeUndefined()
  expect(h.uploads).toEqual([])
}, 120_000)

it.each(['undeclared', 'hash', 'missing', 'duplicate', 'escape', 'symlink', 'reference'])('rejects %s source preparation receipts before build or upload', async (failure) => {
  const h = await sourceFixture(failure === 'reference')
  const report = await releaseSnapshot({ ...h.options, ...(failure === 'reference' ? { referenceGitlinks: ['references/tooling'] } : {}), prepareSource: async ({ directory }) => {
    const relative = failure === 'reference' ? 'references/tooling/unexpected.node' : 'packages/a/binding.node'
    await mkdir(path.dirname(path.join(directory, relative)), { recursive: true })
    if (failure === 'symlink') {
      await symlink(path.join(directory, 'packages/a/index.js'), path.join(directory, relative))
    }
    else if (failure !== 'missing') {
      await writeFile(path.join(directory, relative), 'native-input')
    }
    const entry = { path: relative, sha256: sha256('native-input') }
    return { files: failure === 'undeclared' ? [] : failure === 'duplicate' ? [entry, entry] : failure === 'escape' ? [{ ...entry, path: '../outside' }] : failure === 'hash' ? [{ ...entry, sha256: 'a'.repeat(64) }] : [entry] }
  } })
  expect(report.status).toBe('failed')
  expect(report.error).toMatch(/artifact|relative paths|links|omitted directory/u)
  expect(report.preparation).toBeUndefined()
  expect(h.uploads).toEqual([])
}, 120_000)
