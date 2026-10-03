import fs from 'node:fs/promises'
import { captureTemplateSnapshot, compareTemplateSnapshots, loadTemplateBaseline } from '@icebreakers/monorepo-templates'
import path from 'pathe'
import { expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist -- Verify the delivered move and upgrade APIs together.
import { applyTemplateUpgradePlan, applyWorkspaceMovePlan, listTemplateInstances, planTemplateUpgrade, planWorkspaceMove } from '../../../../dist/index.mjs'
import { nextSource, registeredFixture } from './fixture'

it.each([{ to: 'libs/core' }, { name: '@business/core' }, { to: 'libs/core', name: '@business/core' }])('keeps provenance and business changes through move and a later upgrade: %j', async (options) => {
  const h = await registeredFixture()
  const before = h.instance
  const plan = await planWorkspaceMove(h.workspace, { target: 'old', ...options })
  expect(plan.canApply, JSON.stringify(plan.blockers)).toBe(true)
  expect(plan.inputs.map(input => input.path)).not.toContain('.repoctl/template-instances.json')
  expect(plan.review.scanned).not.toContain('.repoctl/template-instances.json')
  expect(plan.templateInstances.relocations).toEqual([{ id: before.id, from: before.target, to: options.to ?? before.target }])
  const result = await applyWorkspaceMovePlan(h.workspace, JSON.parse(JSON.stringify(plan)))
  expect(result.status).toBe('applied')
  expect(result.cleanupPending).toEqual([])
  const [record] = await listTemplateInstances(h.workspace)
  expect(record).toMatchObject({ instance: { ...before, target: options.to ?? before.target }, targetStatus: 'present', baselineStatus: 'available' })
  expect((await applyWorkspaceMovePlan(h.workspace, plan)).status).toBe('unchanged')
  const target = path.join(h.workspace, record!.instance.target)
  if (before.baseline.status !== 'available') {
    throw new Error('Expected the retained baseline.')
  }
  const drift = compareTemplateSnapshots(await loadTemplateBaseline(h.workspace, before.baseline.rendered), await captureTemplateSnapshot(target))
  expect(drift).toContainEqual({ path: 'business.txt', status: 'added' })
  expect(drift).toContainEqual({ path: 'src/index.ts', status: 'modified' })
  const upgrade = await planTemplateUpgrade({ cwd: h.workspace, instance: before.id, version: '99.0.0', sourceDir: await nextSource(h) })
  expect(upgrade.action).toBe('upgrade')
  expect(upgrade.target).toBe(record!.instance.target)
  await applyTemplateUpgradePlan(upgrade)
  expect(await fs.readFile(path.join(target, 'upstream.txt'), 'utf8')).toBe('New upstream capability\n')
  expect(await fs.readFile(path.join(target, 'business.txt'), 'utf8')).toBe('Keep the business implementation\n')
  expect(await fs.readFile(path.join(target, 'src/index.ts'), 'utf8')).toContain('Business customization remains local.')
  expect(JSON.parse(await fs.readFile(path.join(target, 'package.json'), 'utf8')).name).toBe(options.name ?? 'old')
  const after = (await listTemplateInstances(h.workspace))[0]!.instance
  expect(after.id).toBe(before.id)
  expect(after.parameters).toEqual(before.parameters)
  expect(after.source.version).toBe('99.0.0')
})

it.each(['target', 'source', 'added-instance'])('rejects registry changes during replay: %s', async (change) => {
  const h = await registeredFixture()
  const plan = await planWorkspaceMove(h.workspace, { target: 'old', to: 'libs/core' })
  await applyWorkspaceMovePlan(h.workspace, plan)
  const registry = JSON.parse(await fs.readFile(h.registryFile, 'utf8'))
  if (change === 'target') {
    registry.instances[0].target = 'packages/old'
  }
  else if (change === 'source') {
    registry.instances[0].source.version = '98.0.0'
  }
  else {
    registry.instances.push({ ...h.instance, id: 'abcdef123456abcdef123456', target: 'packages/retained' })
  }
  const raw = `${JSON.stringify(registry)}\n`
  await fs.writeFile(h.registryFile, raw)
  await expect(applyWorkspaceMovePlan(h.workspace, plan)).rejects.toThrow('registry changed')
  expect(await fs.readFile(h.registryFile, 'utf8')).toBe(raw)
  expect(await fs.readFile(path.join(h.workspace, 'libs/core/business.txt'), 'utf8')).toContain('business implementation')
})
