import fs from 'node:fs/promises'
import path from 'node:path'
import { expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist
import { applyTemplateLinkPlan, applyTemplateUpgradePlan, listTemplateInstances, planTemplateLink, planTemplateUpgrade } from '../../../../dist/index.mjs'
import { contents, originalCode, upgradeFixture, write } from './fixtures'

it('previews without writes and applies only upstream changes to the selected instance', async (t) => {
  const f = await upgradeFixture(t)
  await write(f.cwd, 'root-asset.txt', 'Root ownership is separate\n')
  await write(f.cwd, 'packages/other/business.ts', 'Other instance remains unchanged\n')
  await applyTemplateLinkPlan(await planTemplateLink({ cwd: f.cwd, target: 'packages/other', template: 'tsdown', version: '1.2.3', sourceDir: f.sourceDir, profile: 'workspace-copy-v1' }))
  const other = (await listTemplateInstances(f.cwd)).find(item => item.instance.target === 'packages/other')!.instance
  await write(f.targetDir, '.env', 'private-api-token=do-not-serialize\n')
  await write(f.nextSource, 'templates/tsdown/src/index.ts', originalCode.replace('first = 1', 'first = 2'))
  await write(f.nextSource, 'templates/tsdown/src/added.ts', 'export const added = true\n')
  const before = await contents(f.root)
  const plan = await planTemplateUpgrade(f.options)
  expect(await contents(f.root)).toEqual(before)
  expect(plan.action).toBe('upgrade')
  expect(JSON.stringify(plan)).not.toContain('private-api-token')
  expect(plan.changes.find(item => item.path === 'src/added.ts')?.status).toBe('add')
  await applyTemplateUpgradePlan(plan)
  expect(await fs.readFile(path.join(f.targetDir, 'src/index.ts'), 'utf8')).toContain('first = 2')
  expect(await fs.readFile(path.join(f.cwd, 'root-asset.txt'), 'utf8')).toBe('Root ownership is separate\n')
  expect(await fs.readFile(path.join(f.cwd, 'packages/other/business.ts'), 'utf8')).toBe('Other instance remains unchanged\n')
  expect((await listTemplateInstances(f.cwd))[0]!.instance.source.version).toBe('2.0.0')
  expect((await listTemplateInstances(f.cwd)).find(item => item.instance.target === 'packages/other')!.instance).toEqual(other)
  const applied = await contents(f.cwd)
  await fs.rm(f.nextSource, { recursive: true })
  const repeated = await planTemplateUpgrade({ cwd: f.cwd, instance: f.target, version: '2.0.0' })
  expect(repeated.action).toBe('unchanged')
  expect((await applyTemplateUpgradePlan(repeated)).status).toBe('unchanged')
  expect(await contents(f.cwd)).toEqual(applied)
})

it('preserves business-only changes while advancing the requested source version', async (t) => {
  const f = await upgradeFixture(t)
  const business = originalCode.replace('first = 1', 'first = 42')
  await write(f.targetDir, 'src/index.ts', business)
  const plan = await planTemplateUpgrade(f.options)
  expect(plan.changes.find(item => item.path === 'src/index.ts')?.reason).toBe('local-changes-preserved')
  await applyTemplateUpgradePlan(plan)
  expect(await fs.readFile(path.join(f.targetDir, 'src/index.ts'), 'utf8')).toBe(business)
  expect((await listTemplateInstances(f.cwd))[0]!.instance.source.version).toBe('2.0.0')
})

it('merges non-overlapping edits and preserves BOM, CRLF and the final newline', async (t) => {
  const base = `\uFEFF${originalCode.replaceAll('\n', '\r\n')}`
  const f = await upgradeFixture(t, base)
  await write(f.targetDir, 'src/index.ts', base.replace('first = 1', 'first = 42'))
  await write(f.nextSource, 'templates/tsdown/src/index.ts', base.replace('second = 1', 'second = 2'))
  const plan = await planTemplateUpgrade(f.options)
  expect(plan.action).toBe('upgrade')
  expect(plan.changes.find(item => item.path === 'src/index.ts')?.reason).toBe('three-way-merge')
  await applyTemplateUpgradePlan(plan)
  expect(await fs.readFile(path.join(f.targetDir, 'src/index.ts'), 'utf8')).toBe(base.replace('first = 1', 'first = 42').replace('second = 1', 'second = 2'))
})

it('reports overlapping edits and applies no files or source metadata', async (t) => {
  const f = await upgradeFixture(t)
  await write(f.targetDir, 'src/index.ts', originalCode.replace('first = 1', 'first = 42'))
  await write(f.nextSource, 'templates/tsdown/src/index.ts', originalCode.replace('first = 1', 'first = 2'))
  await write(f.nextSource, 'templates/tsdown/README.md', 'Another upstream change\n')
  const before = await contents(f.cwd)
  const plan = await planTemplateUpgrade(f.options)
  expect(plan.action).toBe('conflict')
  expect(plan.changes.find(item => item.path === 'src/index.ts')?.conflicts).toEqual(expect.arrayContaining([expect.objectContaining({ local: expect.stringContaining('first = 42'), upstream: expect.stringContaining('first = 2') })]))
  await expect(applyTemplateUpgradePlan(plan)).rejects.toThrow('unresolved conflicts')
  expect(await contents(f.cwd)).toEqual(before)
})
