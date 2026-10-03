import fs from 'node:fs/promises'
import path from 'pathe'
import { expect, it } from 'vitest'
import { createTemplateUpgradeJournal } from '@/commands/template-instances/upgrade/transaction/journal'
// eslint-disable-next-line antfu/no-import-dist -- Assert the public operation boundary on built artifacts.
import { applyWorkspaceMovePlan, createNewProject, listTemplateInstances, planTemplateUpgrade, planWorkspaceMove } from '../../../../dist/index.mjs'
import { commit, fixture, snapshot, writeJson } from '../fixture'
import { nextSource, registeredFixture } from './fixture'

it('moves registered descendants together without changing their baselines or parameters', async () => {
  const h = await fixture()
  await createNewProject({ cwd: h.workspace, name: 'packages/old/one' })
  await createNewProject({ cwd: h.workspace, name: 'packages/old/two' })
  await fs.writeFile(path.join(h.workspace, 'packages/old/one/business.txt'), 'Local descendant feature\n')
  await commit(h.workspace)
  const before = await listTemplateInstances(h.workspace)
  const plan = await planWorkspaceMove(h.workspace, { target: 'old', to: 'libs/core' })
  expect(plan.templateInstances.relocations).toHaveLength(2)
  await applyWorkspaceMovePlan(h.workspace, plan)
  const after = await listTemplateInstances(h.workspace)
  expect(after.map(record => record.instance)).toEqual(before.map(record => ({ ...record.instance, target: record.instance.target.replace('packages/old/', 'libs/core/') })))
  expect(after.every(record => record.targetStatus === 'present')).toBe(true)
  expect(await fs.readFile(path.join(h.workspace, 'libs/core/one/business.txt'), 'utf8')).toContain('Local descendant feature')
})

it('rejects a move that splits the ownership of a registered parent instance', async () => {
  const h = await registeredFixture()
  await writeJson(path.join(h.targetDir, 'child/package.json'), { name: 'child', private: true })
  await fs.writeFile(path.join(h.workspace, 'pnpm-workspace.yaml'), 'packages: [packages/*, packages/*/child]\n')
  await commit(h.workspace)
  await expect(planWorkspaceMove(h.workspace, { target: 'child', to: 'libs/child' })).rejects.toThrow('belongs to parent template instance')
})

it.each(['packages/retained', 'packages/RETAINED'])('rejects reuse of another retained target, including portable case collisions: %s', async (to) => {
  const h = await registeredFixture()
  await createNewProject({ cwd: h.workspace, name: 'packages/retained' })
  await fs.rm(path.join(h.workspace, 'packages/retained'), { recursive: true })
  await commit(h.workspace)
  const before = await snapshot(h.workspace)
  await expect(planWorkspaceMove(h.workspace, { target: 'old', to })).rejects.toThrow(/target|overlap/iu)
  expect(await snapshot(h.workspace)).toEqual(before)
})

it('rejects new registrations after preview even when the selected workspace was unregistered', async () => {
  const h = await fixture()
  const plan = await planWorkspaceMove(h.workspace, { target: 'old', to: 'libs/core' })
  expect(plan.templateInstances.relocations).toEqual([])
  await createNewProject({ cwd: h.workspace, name: 'packages/other' })
  const before = await snapshot(h.workspace)
  await expect(applyWorkspaceMovePlan(h.workspace, plan)).rejects.toThrow('registry changed')
  expect(await snapshot(h.workspace)).toEqual(before)
})

it('rejects moving an unregistered workspace into a retained instance namespace', async () => {
  const h = await fixture()
  await createNewProject({ cwd: h.workspace, name: 'packages/retained' })
  await fs.rm(path.join(h.workspace, 'packages/retained'), { recursive: true })
  await commit(h.workspace)
  await expect(planWorkspaceMove(h.workspace, { target: 'old', to: 'packages/retained/nested' })).rejects.toThrow('overlaps a registered instance')
})

it('validates pending upgrade recovery before both preview and applying an older saved plan', async () => {
  const h = await registeredFixture()
  const move = await planWorkspaceMove(h.workspace, { target: 'old', to: 'libs/core' })
  const upgrade = await planTemplateUpgrade({ cwd: h.workspace, instance: h.instance.id, version: '99.0.0', sourceDir: await nextSource(h) })
  await createTemplateUpgradeJournal(upgrade, h.instance)
  const before = await snapshot(h.workspace)
  const blocked = await planWorkspaceMove(h.workspace, move.selection)
  expect(blocked.canApply).toBe(false)
  expect(blocked.blockers).toContainEqual({ code: 'template_upgrade_pending', paths: [h.instance.id] })
  await expect(applyWorkspaceMovePlan(h.workspace, move)).rejects.toThrow('pending upgrades')
  expect(await snapshot(h.workspace)).toEqual(before)
})

it.each(['corrupt', 'symlink'])('rejects unsafe or invalid pending recovery metadata: %s', async (kind) => {
  const h = await registeredFixture()
  const journals = path.join(h.workspace, '.repoctl/template-upgrades')
  if (kind === 'corrupt') {
    await fs.mkdir(journals)
    await fs.writeFile(path.join(journals, `${h.instance.id}.json`), '{}\n')
  }
  else {
    const external = path.join(h.root, 'external-journals')
    await fs.mkdir(external)
    await fs.symlink(external, journals, 'junction')
  }
  const before = await snapshot(h.workspace)
  await expect(planWorkspaceMove(h.workspace, { target: 'old', to: 'libs/core' })).rejects.toThrow(/recovery record|Symlinks/)
  expect(await snapshot(h.workspace)).toEqual(before)
})

it('allows unrelated pending upgrades to remain while moving the selected instance', async () => {
  const h = await registeredFixture()
  await createNewProject({ cwd: h.workspace, name: 'packages/other' })
  await commit(h.workspace)
  const other = (await listTemplateInstances(h.workspace)).find(record => record.instance.target === 'packages/other')!.instance
  const upgrade = await planTemplateUpgrade({ cwd: h.workspace, instance: other.id, version: '99.0.0', sourceDir: await nextSource(h) })
  await createTemplateUpgradeJournal(upgrade, other)
  const journalFile = path.join(h.workspace, '.repoctl/template-upgrades', `${other.id}.json`)
  const journal = await fs.readFile(journalFile, 'utf8')
  const plan = await planWorkspaceMove(h.workspace, { target: 'old', to: 'libs/core' })
  expect(plan.canApply).toBe(true)
  await applyWorkspaceMovePlan(h.workspace, plan)
  expect(await fs.readFile(journalFile, 'utf8')).toBe(journal)
})

it.each(['empty', 'replaced-id'])('rejects a tampered replay that omits an instance with pending recovery: %s', async (kind) => {
  const h = await registeredFixture()
  const move = await planWorkspaceMove(h.workspace, { target: 'old', to: 'libs/core' })
  await applyWorkspaceMovePlan(h.workspace, move)
  const current = (await listTemplateInstances(h.workspace))[0]!.instance
  const upgrade = await planTemplateUpgrade({ cwd: h.workspace, instance: current.id, version: '99.0.0', sourceDir: await nextSource(h) })
  await createTemplateUpgradeJournal(upgrade, current)
  const before = await snapshot(h.workspace)
  const tampered = structuredClone(move)
  tampered.templateInstances.relocations = kind === 'empty' ? [] : tampered.templateInstances.relocations.map(item => ({ ...item, id: 'abcdef123456abcdef123456' }))
  await expect(applyWorkspaceMovePlan(h.workspace, tampered)).rejects.toThrow('move plan changed or is invalid')
  await expect(applyWorkspaceMovePlan(h.workspace, move)).rejects.toThrow('pending upgrades')
  expect(await snapshot(h.workspace)).toEqual(before)
})
