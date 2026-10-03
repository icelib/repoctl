import fs from 'node:fs/promises'
import { registerTemplateInstances } from '@icebreakers/monorepo-templates'
import path from 'pathe'
import { expect, it, vi } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist -- Reuse must preserve two independent delivered instances.
import { applyTemplateLinkPlan, applyTemplateUpgradePlan, applyWorkspaceMovePlan, createNewProject, listTemplateInstances, planTemplateLink, planTemplateUpgrade, planWorkspaceMove } from '../../../../dist/index.mjs'
import { nextSource, registeredFixture } from './fixture'

it('creates a new identity at the freed original path and upgrades both instances independently', async () => {
  const h = await registeredFixture()
  await applyWorkspaceMovePlan(h.workspace, await planWorkspaceMove(h.workspace, { target: 'old', to: 'libs/core', name: '@business/core' }))
  await createNewProject({ cwd: h.workspace, name: 'packages/old', type: 'tsdown' })
  await fs.writeFile(path.join(h.targetDir, 'second-business.txt'), 'Independent second project\n')
  const records = await listTemplateInstances(h.workspace)
  expect(records).toHaveLength(2)
  expect(new Set(records.map(record => record.instance.id)).size).toBe(2)
  const moved = records.find(record => record.instance.id === h.instance.id)!.instance
  const created = records.find(record => record.instance.target === 'packages/old')!.instance
  expect(moved).toEqual({ ...h.instance, target: 'libs/core' })
  expect(created.id).not.toBe(h.instance.id)
  const registryBeforeRetry = await fs.readFile(h.registryFile, 'utf8')
  const [retried] = await registerTemplateInstances(h.workspace, [{ instance: { ...created, id: h.instance.id }, snapshots: {} }], undefined, { allocateIdOnConflict: true })
  expect(retried!.id).toBe(created.id)
  expect(await fs.readFile(h.registryFile, 'utf8')).toBe(registryBeforeRetry)
  const sourceDir = await nextSource(h)
  for (const instance of [moved, created]) {
    const upgrade = await planTemplateUpgrade({ cwd: h.workspace, instance: instance.id, version: '99.0.0', sourceDir })
    expect(upgrade.action).toBe('upgrade')
    await applyTemplateUpgradePlan(upgrade)
  }
  expect(await fs.readFile(path.join(h.workspace, 'libs/core/business.txt'), 'utf8')).toContain('business implementation')
  expect(await fs.readFile(path.join(h.workspace, 'libs/core/src/index.ts'), 'utf8')).toContain('Business customization remains local.')
  expect(await fs.readFile(path.join(h.targetDir, 'second-business.txt'), 'utf8')).toContain('Independent second project')
  for (const instance of [moved, created]) {
    expect(await fs.readFile(path.join(h.workspace, instance.target, 'upstream.txt'), 'utf8')).toBe('New upstream capability\n')
  }
  const after = await listTemplateInstances(h.workspace)
  expect(after.map(record => record.instance.id)).toEqual(records.map(record => record.instance.id))
  expect(after.every(record => record.instance.source.version === '99.0.0')).toBe(true)
  expect(JSON.parse(await fs.readFile(path.join(h.workspace, 'libs/core/package.json'), 'utf8')).name).toBe('@business/core')
  expect(JSON.parse(await fs.readFile(path.join(h.targetDir, 'package.json'), 'utf8')).name).toBe('old')
})

it('preserves failed creation output and recovers an independent identity through explicit linking', async () => {
  const h = await registeredFixture()
  await applyWorkspaceMovePlan(h.workspace, await planWorkspaceMove(h.workspace, { target: 'old', to: 'libs/core' }))
  const registry = await fs.readFile(h.registryFile, 'utf8')
  const rename = fs.rename.bind(fs)
  const spy = vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
    if (String(to) === h.registryFile) {
      throw new Error('Injected new instance registration failure')
    }
    return rename(from, to)
  })
  try {
    const error = await createNewProject({ cwd: h.workspace, name: 'packages/old', type: 'tsdown' }).catch(error => error)
    expect(error).toHaveProperty('message', expect.stringContaining('provenance registration failed'))
    expect(error).toHaveProperty('cause.message', 'Injected new instance registration failure')
  }
  finally {
    spy.mockRestore()
  }
  expect(await fs.readFile(h.registryFile, 'utf8')).toBe(registry)
  expect(JSON.parse(await fs.readFile(path.join(h.targetDir, 'package.json'), 'utf8')).name).toBe('old')
  expect(await fs.readFile(path.join(h.workspace, 'libs/core/business.txt'), 'utf8')).toContain('business implementation')
  await expect(createNewProject({ cwd: h.workspace, name: 'packages/old', type: 'tsdown' })).rejects.toThrow('already exists')
  const sourceDir = await nextSource(h)
  await fs.rm(path.join(sourceDir, 'templates/tsdown/upstream.txt'))
  await fs.writeFile(path.join(sourceDir, 'package.json'), JSON.stringify({ name: '@icebreakers/monorepo-templates', version: h.instance.source.version }))
  const options = { cwd: h.workspace, target: 'packages/old', template: 'tsdown', version: h.instance.source.version!, sourceDir }
  await applyTemplateLinkPlan(await planTemplateLink(options))
  const instances = (await listTemplateInstances(h.workspace)).map(record => record.instance)
  expect(instances).toContainEqual({ ...h.instance, target: 'libs/core' })
  expect(new Set(instances.map(instance => instance.id)).size).toBe(2)
  const after = await fs.readFile(h.registryFile, 'utf8')
  const retry = await planTemplateLink(options)
  expect(retry.action).toBe('unchanged')
  await applyTemplateLinkPlan(retry)
  expect(await fs.readFile(h.registryFile, 'utf8')).toBe(after)
})

it('keeps explicit caller-supplied IDs strict unless allocation is requested', async () => {
  const h = await registeredFixture()
  await fs.mkdir(path.join(h.workspace, 'packages/explicit'))
  const registry = await fs.readFile(h.registryFile, 'utf8')
  await expect(registerTemplateInstances(h.workspace, [{ instance: { ...h.instance, target: 'packages/explicit' }, snapshots: {} }])).rejects.toThrow('identity is already registered')
  expect(await fs.readFile(h.registryFile, 'utf8')).toBe(registry)
})
