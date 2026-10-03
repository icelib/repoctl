import fs from 'node:fs/promises'
import path from 'node:path'
import { expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist
import { checkTemplateDrift, hasTemplateDriftIssues } from '../../../dist/index.mjs'
import { contents, fixture, rootBaseline, write } from './fixtures'

it('compares only trustworthy root baselines without mixing instance ownership', async (t) => {
  const f = await fixture(t)
  await rootBaseline(f.cwd)
  await write(f.cwd, 'Dockerfile', 'Unmanaged Dockerfile')
  await write(f.cwd, '.editorconfig', 'Business configuration')
  const before = await contents(f.cwd)
  const report = await checkTemplateDrift(f.cwd, { sourceDir: f.sourceDir })
  expect(report.owners.filter(owner => owner.kind === 'root-asset')).toHaveLength(1)
  expect(report.owners.find(owner => owner.kind === 'root-asset')).toMatchObject({ path: '.editorconfig', local: 'drifted', version: { status: 'same' }, files: [{ path: '.editorconfig', state: 'modified' }] })
  expect(report.owners.find(owner => owner.kind === 'instance')?.local).toBe('unchanged')
  expect(JSON.stringify(report)).not.toContain('Dockerfile')
  expect(await contents(f.cwd)).toEqual(before)
})

it('reports deleted root assets and upstream version changes independently', async (t) => {
  const f = await fixture(t)
  await rootBaseline(f.cwd)
  await fs.rm(path.join(f.cwd, '.editorconfig'))
  const report = await checkTemplateDrift(f.cwd, { sourceDir: f.nextSource })
  expect(report.owners.find(owner => owner.kind === 'root-asset')).toMatchObject({ local: 'drifted', version: { status: 'newer' }, files: [{ state: 'deleted' }] })
  expect(hasTemplateDriftIssues(report, true)).toBe(true)
})

it.for(['corrupt', 'escaping', 'foreign-owned'] as const)('does not trust %s root records', async (kind, t) => {
  const f = await fixture(t)
  const root = await rootBaseline(f.cwd)
  if (kind === 'corrupt') {
    root.record.upstream.hash = '0'.repeat(64)
  }
  else {
    root.record.path = kind === 'escaping' ? '../secret' : `${f.target}/package.json`
  }
  await write(f.cwd, root.metadata, JSON.stringify(root.record))
  const report = await checkTemplateDrift(f.cwd, { sourceDir: f.sourceDir })
  expect(report.rootRegistry.status).toBe('unavailable')
  expect(report.owners.filter(owner => owner.kind === 'root-asset')).toEqual([])
  expect(hasTemplateDriftIssues(report, true)).toBe(true)
})

it('leaves unregistered root assets outside its ownership claims', async (t) => {
  const f = await fixture(t)
  await write(f.cwd, '.editorconfig', 'No retained upstream version')
  const report = await checkTemplateDrift(f.cwd, { sourceDir: f.sourceDir })
  expect(report.rootRegistry.status).toBe('absent')
  expect(report.owners.filter(owner => owner.kind === 'root-asset')).toEqual([])
  expect(report.summary.warn).toBe(0)
})
