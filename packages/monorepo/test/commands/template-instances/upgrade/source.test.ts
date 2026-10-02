import fs from 'node:fs/promises'
import path from 'node:path'
import { expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist
import { applyTemplateLinkPlan, applyTemplateUpgradePlan, listTemplateInstances, planTemplateLink, planTemplateUpgrade } from '../../../../dist/index.mjs'
import { fixture } from '../fixtures'
import { contents, originalCode, upgradeFixture, write } from './fixtures'

it('refuses an unverified old source even when a new source is supplied', async (t) => {
  const f = await fixture(t)
  const sourceDir = path.join(f.root, 'missing-package')
  await applyTemplateLinkPlan(await planTemplateLink({ ...f.options, sourceDir, allowUnverified: true }))
  const before = await contents(f.cwd)
  await expect(planTemplateUpgrade({ cwd: f.cwd, instance: f.target, version: '1.2.3', sourceDir: f.sourceDir })).rejects.toThrow('no reliable historical baseline')
  expect(await contents(f.cwd)).toEqual(before)
})

it('rejects missing/corrupt retained baselines before changing files', async (t) => {
  const f = await upgradeFixture(t)
  const instance = (await listTemplateInstances(f.cwd))[0]!.instance
  if (instance.baseline.status !== 'available') {
    throw new Error('Expected retained baseline')
  }
  const baseline = path.join(f.cwd, '.repoctl/template-baselines', `${instance.baseline.rendered}.json`)
  await fs.writeFile(baseline, '{"schemaVersion":1,"files":[],"directories":[]}\n')
  const before = await contents(f.cwd)
  await expect(planTemplateUpgrade(f.options)).rejects.toThrow('integrity check failed')
  expect(await contents(f.cwd)).toEqual(before)
  await fs.unlink(baseline)
  await expect(planTemplateUpgrade(f.options)).rejects.toThrow()
})

it('rejects missing, mismatched, invalid and mutable same-version sources without writes', async (t) => {
  const f = await upgradeFixture(t)
  const before = await contents(f.cwd)
  await expect(planTemplateUpgrade({ ...f.options, sourceDir: path.join(f.root, 'absent') })).rejects.toThrow('source is unavailable')
  await expect(planTemplateUpgrade({ ...f.options, version: 'latest' })).rejects.toThrow('exact target')
  await expect(planTemplateUpgrade({ ...f.options, version: '3.0.0' })).rejects.toThrow('not requested')
  await write(f.nextSource, 'package.json', 'invalid json')
  await expect(planTemplateUpgrade(f.options)).rejects.toThrow()
  await write(f.sourceDir, 'templates/tsdown/src/index.ts', 'Changed behind the version\n')
  await expect(planTemplateUpgrade({ ...f.options, sourceDir: f.sourceDir, version: '1.2.3' })).rejects.toThrow('changed under the same package version')
  expect(await contents(f.cwd)).toEqual(before)
})

it('rechecks stale and edited plans before any writes', async (t) => {
  const f = await upgradeFixture(t)
  await write(f.nextSource, 'templates/tsdown/src/index.ts', originalCode.replace('first = 1', 'first = 2'))
  const plan = await planTemplateUpgrade(f.options)
  const altered = structuredClone(plan)
  altered.changes[0]!.reason = 'edited'
  await expect(applyTemplateUpgradePlan(altered)).rejects.toThrow('stale or was edited')
  await write(f.targetDir, 'README.md', 'New business edit after preview\n')
  const before = await contents(f.cwd)
  await expect(applyTemplateUpgradePlan(plan)).rejects.toThrow('stale or was edited')
  expect(await contents(f.cwd)).toEqual(before)
})
