import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { afterEach, expect, it, vi } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist
import { checkTemplateDrift, hasTemplateDriftIssues } from '../../../dist/index.mjs'
import { contents, editRegistry, fixture, write } from './fixtures'

afterEach(() => vi.unstubAllGlobals())

it('keeps newer package evidence independent of clean or changed local files and stays read-only', async (t) => {
  const f = await fixture(t)
  const before = await contents(f.cwd)
  const clean = await checkTemplateDrift(f.cwd, { sourceDir: f.nextSource })
  expect(clean.owners[0]).toMatchObject({ path: f.target, version: { status: 'newer', currentVersion: '1.2.3', comparedVersion: '2.0.0' }, baseline: { status: 'available' }, local: 'unchanged' })
  expect(await contents(f.cwd)).toEqual(before)
  await write(f.targetDir, 'README.md', 'Private business text, absent from diagnostics')
  const changed = await checkTemplateDrift(f.cwd, { sourceDir: f.sourceDir })
  expect(changed.owners[0]).toMatchObject({ version: { status: 'same' }, local: 'drifted' })
  expect(changed.owners[0]?.files.find(file => file.path.endsWith('/README.md'))).toMatchObject({ state: 'modified', currentHash: expect.any(String), baselineHash: expect.any(String) })
  expect(JSON.stringify(changed)).not.toContain('Private business text')
  expect(hasTemplateDriftIssues(changed)).toBe(false)
  expect(hasTemplateDriftIssues(changed, true)).toBe(true)
})

it('never queries the network by default or with explicit local evidence', async (t) => {
  const f = await fixture(t)
  const fetch = vi.fn(() => {
    throw new Error('Unexpected network access')
  })
  vi.stubGlobal('fetch', fetch)
  expect((await checkTemplateDrift(f.cwd)).evidence).toMatchObject({ kind: 'installed', status: 'available' })
  expect((await checkTemplateDrift(f.cwd, { sourceDir: f.sourceDir })).evidence).toMatchObject({ kind: 'extracted', version: '1.2.3' })
  expect(fetch).not.toHaveBeenCalled()
})

it('ignores unowned business files and marks retained deletions explicitly', async (t) => {
  const f = await fixture(t)
  await write(f.targetDir, 'new-business/secret.txt', 'Private')
  await fs.rm(path.join(f.targetDir, 'README.md'))
  const report = await checkTemplateDrift(f.cwd, { sourceDir: f.sourceDir })
  expect(report.owners[0]?.files.find(file => file.path.endsWith('/README.md'))?.state).toBe('deleted')
  expect(JSON.stringify(report)).not.toContain('new-business')
  expect(report.owners[0]?.local).toBe('drifted')
})

it.skipIf(process.platform === 'win32')('does not traverse excluded or unrelated symlinks, but diagnoses managed unsafe paths', async (t) => {
  const f = await fixture(t)
  await editRegistry(f.cwd, registry => registry.instances[0]!.excludedPaths = ['README.md'])
  await fs.rm(path.join(f.targetDir, 'README.md'))
  await fs.symlink('/unavailable-business-secret', path.join(f.targetDir, 'README.md'))
  await fs.symlink('/unavailable-business-secret', path.join(f.targetDir, 'unmanaged'))
  const excluded = await checkTemplateDrift(f.cwd, { sourceDir: f.sourceDir })
  expect(excluded.owners[0]?.files.find(file => file.path.endsWith('/README.md'))?.state).toBe('excluded')
  expect(excluded.summary.warn).toBe(0)
  await editRegistry(f.cwd, registry => registry.instances[0]!.excludedPaths = [])
  const unsafe = await checkTemplateDrift(f.cwd, { sourceDir: f.sourceDir })
  expect(unsafe.owners[0]?.files.find(file => file.path.endsWith('/README.md'))?.state).toBe('unavailable')
  expect(unsafe.owners[0]?.local).toBe('unknown')
})

it.for(['unverified', 'missing', 'corrupt'] as const)('reports %s baseline evidence without manufacturing a clean result', async (mode, t) => {
  const f = await fixture(t)
  const registry = await editRegistry(f.cwd, (record) => {
    record.instances[0]!.excludedPaths = ['README.md']
    if (mode === 'unverified') {
      record.instances[0]!.baseline = { status: 'unverified', reason: 'source-unavailable' }
    }
  })
  const baseline = registry.instances[0]!.baseline
  if (baseline.status === 'available') {
    const file = path.join(f.cwd, `.repoctl/template-baselines/${baseline.rendered}.json`)
    if (mode === 'missing') {
      await fs.rm(file)
    }
    else {
      await fs.writeFile(file, '{}')
    }
  }
  const report = await checkTemplateDrift(f.cwd, { sourceDir: f.sourceDir })
  expect(report.owners[0]).toMatchObject({ baseline: { status: mode === 'unverified' ? 'unverified' : 'unavailable' }, local: 'unknown', version: { status: 'same' } })
  expect(report.owners[0]?.files).toContainEqual({ path: `${f.target}/README.md`, state: 'excluded', detail: 'Explicitly excluded from template management.' })
  expect(hasTemplateDriftIssues(report, true)).toBe(true)
})

it('keeps custom snapshot source versions explicitly unknown', async (t) => {
  const f = await fixture(t)
  await editRegistry(f.cwd, (registry) => {
    const instance = registry.instances[0]!
    instance.source = { kind: 'snapshot', templatePath: 'template', digest: instance.source.digest! }
  })
  const report = await checkTemplateDrift(f.cwd, { sourceDir: f.sourceDir })
  expect(report.owners[0]).toMatchObject({ local: 'unchanged', version: { status: 'unknown' } })
  expect(hasTemplateDriftIssues(report, true)).toBe(true)
})

it('reports missing and malformed registries separately from verified healthy instances', async (t) => {
  const f = await fixture(t)
  const file = path.join(f.cwd, '.repoctl/template-instances.json')
  await fs.rm(file)
  const absent = await checkTemplateDrift(f.cwd, { sourceDir: f.sourceDir })
  expect(absent.instanceRegistry.status).toBe('absent')
  expect(absent.owners).toEqual([])
  await fs.writeFile(file, '{}')
  const invalid = await checkTemplateDrift(f.cwd, { sourceDir: f.sourceDir })
  expect(invalid.instanceRegistry.status).toBe('unavailable')
  expect(hasTemplateDriftIssues(invalid, true)).toBe(true)
})
