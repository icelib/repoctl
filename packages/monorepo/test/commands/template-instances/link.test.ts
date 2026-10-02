import fs from 'node:fs/promises'
import path from 'node:path'
import { expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist
import { applyTemplateLinkPlan, listTemplateInstances, planTemplateLink, rebuildTemplateInstanceBaseline } from '../../../dist/index.mjs'
import { contents, fixture, write } from './fixtures'

it('previews real differences without writing, then links only metadata and reconstructs historical output offline', async (t) => {
  const f = await fixture(t)
  const before = await contents(f.cwd)
  const plan = await planTemplateLink(f.options)
  expect(await contents(f.cwd)).toEqual(before)
  expect(plan.source).toMatchObject({ kind: 'package', version: '1.2.3', templatePath: 'templates/tsdown' })
  expect(plan.differences).toEqual(expect.arrayContaining([
    { path: 'src/index.ts', status: 'modified' },
    { path: 'README.md', status: 'deleted' },
    { path: 'business.txt', status: 'added' },
  ]))
  const business = await contents(path.join(f.cwd, f.target))
  await applyTemplateLinkPlan(plan)
  expect(await contents(path.join(f.cwd, f.target))).toEqual(business)
  const [linked] = await listTemplateInstances(f.cwd)
  expect(linked!.baselineStatus).toBe('available')
  expect(linked!.instance.provenance).toBe('linked')
  expect(linked!.instance.parameters).toEqual({ packageName: 'legacy', renameJson: false })
  await fs.rm(f.sourceDir, { recursive: true })
  await rebuildTemplateInstanceBaseline(f.cwd, linked!.instance.id, path.join(f.root, 'rendered'))
  await rebuildTemplateInstanceBaseline(f.cwd, linked!.instance.id, path.join(f.root, 'original'), 'original')
  expect(await fs.readFile(path.join(f.root, 'rendered/src/index.ts'), 'utf8')).toContain('original template')
  expect(JSON.parse(await fs.readFile(path.join(f.root, 'rendered/package.json'), 'utf8'))).toEqual({ name: 'legacy', version: '0.0.0' })
  expect(JSON.parse(await fs.readFile(path.join(f.root, 'original/package.json'), 'utf8'))).toMatchObject({ name: 'old-template', version: '1.2.3' })
  expect(await fs.readFile(path.join(f.root, 'rendered/.gitignore'), 'utf8')).toBe('dist\n')
  const registered = await contents(path.join(f.cwd, '.repoctl'))
  const repeated = await planTemplateLink({ cwd: f.cwd, target: f.target, template: 'tsdown', version: '1.2.3' })
  expect(repeated.action).toBe('unchanged')
  await applyTemplateLinkPlan(repeated)
  expect(await contents(path.join(f.cwd, '.repoctl'))).toEqual(registered)
})

it('does not manufacture a baseline for an unavailable version or silently accept floating versions', async (t) => {
  const f = await fixture(t)
  const options = { cwd: f.cwd, target: f.target, template: 'tsdown', version: '98765.0.0' }
  const plan = await planTemplateLink(options)
  expect(plan.baselineStatus).toBe('unverified')
  expect(plan.differences).toEqual([])
  expect(plan.limitations).toContain('reliable-upgrade-unavailable')
  await expect(applyTemplateLinkPlan(plan)).rejects.toThrow('explicitly allow')
  await applyTemplateLinkPlan(await planTemplateLink({ ...options, allowUnverified: true }))
  const [record] = await listTemplateInstances(f.cwd)
  expect(record!.baselineStatus).toBe('unverified')
  await expect(rebuildTemplateInstanceBaseline(f.cwd, record!.instance.id, path.join(f.root, 'missing'))).rejects.toThrow('no verified baseline')
  await expect(planTemplateLink({ ...options, version: 'latest' })).rejects.toThrow('exact historical')
  await expect(planTemplateLink({ ...options, version: '1.2.3-alpha..2' })).rejects.toThrow('exact historical')
  await expect(planTemplateLink({ ...options, version: '1.2.3-01' })).rejects.toThrow('exact historical')
  await expect(planTemplateLink({ ...f.options, version: '1.2.4' })).rejects.toThrow('not requested')
})

it('can explicitly verify a previously unverified association when the exact source becomes available', async (t) => {
  const f = await fixture(t)
  await applyTemplateLinkPlan(await planTemplateLink({ cwd: f.cwd, target: f.target, template: 'tsdown', version: '1.2.3', allowUnverified: true }))
  const before = await contents(path.join(f.cwd, f.target))
  const [unverified] = await listTemplateInstances(f.cwd)
  const plan = await planTemplateLink(f.options)
  expect(plan.action).toBe('verify')
  expect(plan.differences.length).toBeGreaterThan(0)
  await applyTemplateLinkPlan(plan)
  const [verified] = await listTemplateInstances(f.cwd)
  expect(verified!.instance.id).toBe(unverified!.instance.id)
  expect(verified!.baselineStatus).toBe('available')
  expect(await contents(path.join(f.cwd, f.target))).toEqual(before)
})

it('rejects stale target, source and registry changes without replacing provenance', async (t) => {
  const f = await fixture(t)
  const plan = await planTemplateLink(f.options)
  await write(f.cwd, `${f.target}/business.txt`, 'Changed after preview\n')
  await expect(applyTemplateLinkPlan(plan)).rejects.toThrow('stale')
  const next = await planTemplateLink(f.options)
  await write(f.sourceDir, 'templates/tsdown/README.md', 'Changed historical source\n')
  await expect(applyTemplateLinkPlan(next)).rejects.toThrow('stale')
  const ready = await planTemplateLink(f.options)
  await applyTemplateLinkPlan(ready)
  const before = await contents(path.join(f.cwd, '.repoctl'))
  await write(f.sourceDir, 'templates/tsdown/README.md', 'Different content under the same version\n')
  const conflict = await planTemplateLink(f.options)
  expect(conflict.action).toBe('conflict')
  await expect(applyTemplateLinkPlan(conflict)).rejects.toThrow('conflicts')
  expect(await contents(path.join(f.cwd, '.repoctl'))).toEqual(before)
})

it('reports missing or corrupt retained baselines instead of claiming availability', async (t) => {
  const f = await fixture(t)
  await applyTemplateLinkPlan(await planTemplateLink(f.options))
  const [record] = await listTemplateInstances(f.cwd)
  expect(record!.instance.baseline.status).toBe('available')
  if (record!.instance.baseline.status !== 'available') {
    throw new Error('Expected a verified baseline')
  }
  const baselineFile = path.join(f.cwd, '.repoctl/template-baselines', `${record!.instance.baseline.rendered}.json`)
  await fs.writeFile(baselineFile, '{"schemaVersion":1,"files":[],"directories":[]}\n')
  expect((await listTemplateInstances(f.cwd))[0]!.baselineStatus).toBe('unavailable')
  await expect(rebuildTemplateInstanceBaseline(f.cwd, record!.instance.id, path.join(f.root, 'corrupt'))).rejects.toThrow('integrity')
})

it('rejects caller-edited plan content and unrelated registrations after preview', async (t) => {
  const f = await fixture(t)
  const plan = await planTemplateLink(f.options)
  await expect(applyTemplateLinkPlan({ ...plan, target: 'packages/other' })).rejects.toThrow('stale')
  await expect(fs.stat(path.join(f.cwd, '.repoctl'))).rejects.toThrow()
  await fs.cp(path.join(f.cwd, f.target), path.join(f.cwd, 'packages/other'), { recursive: true })
  await applyTemplateLinkPlan(await planTemplateLink({ ...f.options, target: 'packages/other' }))
  await expect(applyTemplateLinkPlan(plan)).rejects.toThrow('stale')
  expect((await listTemplateInstances(f.cwd)).map(item => item.instance.target)).toEqual(['packages/other'])
  await applyTemplateLinkPlan(await planTemplateLink(f.options))
  expect(await listTemplateInstances(f.cwd)).toHaveLength(2)
})
