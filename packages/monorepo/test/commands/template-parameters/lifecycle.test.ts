import fs from 'node:fs/promises'
import path from 'node:path'
import { applyTemplateUpgradePlan, createNewProject, listTemplateInstances, planTemplateUpgrade, rebuildTemplateInstanceBaseline, relocateTemplateInstance } from '@icebreakers/monorepo'
import { prepareTemplateInstanceSource, recordGeneratedTemplateInstance } from '@icebreakers/monorepo-templates'
import { expect, it } from 'vitest'
import { contents, fixture, manifest, write } from './fixtures'

it('relocates a pristine instance using its retained files while keeping secret output unmanaged', async (t) => {
  const f = await fixture(t)
  await createNewProject(f.options)
  const destination = 'modules/moved'
  await fs.rename(f.target, path.join(f.cwd, destination))
  const before = await contents(f.cwd)
  expect(await relocateTemplateInstance(f.cwd, f.options.name, destination)).toMatchObject({ changed: true, applied: false })
  expect(await contents(f.cwd)).toEqual(before)
  expect(await relocateTemplateInstance(f.cwd, f.options.name, destination, true)).toMatchObject({ changed: true, applied: true })
  expect(await fs.readFile(path.join(f.cwd, destination, 'credentials.local'), 'utf8')).toBe('TOKEN=secret-value-734\n')
  const baseline = path.join(f.root, 'rebuilt')
  await rebuildTemplateInstanceBaseline(f.cwd, destination, baseline)
  await expect(fs.access(path.join(baseline, 'credentials.local'))).rejects.toThrow()
})

it('projects both sides when relocating a legacy baseline with later exclusions', async (t) => {
  const f = await fixture(t)
  await fs.rm(path.join(f.source, 'sample/repoctl.template.json'))
  const target = path.join(f.cwd, 'modules/legacy')
  await fs.cp(path.join(f.source, 'sample'), target, { recursive: true })
  await recordGeneratedTemplateInstance({ workspaceDir: f.cwd, targetDir: target, template: 'custom', profile: 'workspace-copy-v1', preparedSource: await prepareTemplateInstanceSource(path.join(f.source, 'sample')) })
  const registryPath = path.join(f.cwd, '.repoctl/template-instances.json')
  const registry = JSON.parse(await fs.readFile(registryPath, 'utf8'))
  registry.instances[0].excludedPaths = ['credentials.local']
  await fs.writeFile(registryPath, JSON.stringify(registry))
  await write(target, 'credentials.local', 'changed after exclusion\n')
  await fs.rename(target, path.join(f.cwd, 'modules/moved'))
  expect(await relocateTemplateInstance(f.cwd, 'modules/legacy', 'modules/moved', true)).toMatchObject({ changed: true, applied: true })
})

it('upgrades retained values without secrets, preserves excluded files and accepts explicit new exclusions', async (t) => {
  const f = await fixture(t)
  const label = '../../tsconfig.json @icebreakers/monorepo/tooling'
  await createNewProject({ ...f.options, parameters: { ...f.options.parameters, label } })
  const nextSource = path.join(f.root, 'next-package')
  await fs.mkdir(path.join(nextSource, 'templates'), { recursive: true })
  await fs.cp(path.join(f.source, 'sample'), path.join(nextSource, 'templates/custom'), { recursive: true })
  await write(nextSource, 'package.json', '{"name":"@icebreakers/monorepo-templates","version":"2.0.0"}\n')
  await write(nextSource, 'templates/custom/README.md', 'New upstream documentation\n')
  await write(f.target, 'credentials.local', 'TOKEN=business-secret\n')
  const options = { cwd: f.cwd, instance: f.options.name, version: '2.0.0', sourceDir: nextSource }
  const plan = await planTemplateUpgrade(options)
  expect(plan.action).toBe('upgrade')
  expect(JSON.stringify(plan)).not.toContain('business-secret')
  expect(JSON.stringify(plan)).not.toContain('secret-value-734')
  await applyTemplateUpgradePlan(plan)
  expect(await fs.readFile(path.join(f.target, 'src/index.ts'), 'utf8')).toBe(`export const label = ${JSON.stringify(label)}\n`)
  expect(await fs.readFile(path.join(f.target, 'credentials.local'), 'utf8')).toBe('TOKEN=business-secret\n')
  expect((await planTemplateUpgrade(options)).action).toBe('unchanged')
  await write(nextSource, 'package.json', '{"name":"@icebreakers/monorepo-templates","version":"3.0.0"}\n')
  await write(nextSource, 'templates/custom/src/new-secret.ts', 'export const secret = {{repoctl-json:token}}\n')
  await write(nextSource, 'templates/custom/repoctl.template.json', JSON.stringify({ ...manifest, interpolate: [...manifest.interpolate!, 'src/new-secret.ts'] }))
  const before = await contents(f.cwd)
  await expect(planTemplateUpgrade({ ...options, version: '3.0.0' })).rejects.toThrow('interpolated parameter is missing')
  expect(await contents(f.cwd)).toEqual(before)
  await applyTemplateUpgradePlan(await planTemplateUpgrade({ ...options, version: '3.0.0', exclude: ['src/new-secret.ts'] }))
  await expect(fs.access(path.join(f.target, 'src/new-secret.ts'))).rejects.toThrow()
  expect((await listTemplateInstances(f.cwd))[0]!.instance.excludedPaths).toEqual(['credentials.local', 'src/new-secret.ts'])
  const baseline = path.join(f.root, 'rebuilt')
  await rebuildTemplateInstanceBaseline(f.cwd, f.options.name, baseline)
  await expect(fs.access(path.join(baseline, 'credentials.local'))).rejects.toThrow()
  await expect(fs.access(path.join(baseline, 'src/new-secret.ts'))).rejects.toThrow()
})
