import { access, readFile, writeFile } from 'node:fs/promises'
import path from 'pathe'
import { expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist -- Exercise creation and removal through shipped exports.
import { applyWorkspaceRemovalPlan, checkTemplateDrift, createNewProject, listTemplateInstances, planWorkspaceRemoval, rebuildTemplateInstanceBaseline } from '../../../dist/index.mjs'
import { commit, fixture, git, snapshot, writeJson } from './fixture'

it('keeps created instance history through removal, explains reserved paths, and restores the same identity', async () => {
  const h = await fixture({})
  const source = path.join(h.root, 'templates/minimal')
  await writeJson(path.join(source, 'package.json'), { name: 'minimal', version: '1.0.0', private: true })
  await writeFile(path.join(source, 'index.js'), 'export const message = "template"\n')
  await writeFile(path.join(h.workspace, 'repoctl.config.mjs'), `export default ${JSON.stringify({ commands: { create: { templatesDir: path.dirname(source), templateMap: { minimal: { source: 'minimal', target: 'packages/generated' } } } } })}\n`)
  await createNewProject({ cwd: h.workspace, name: 'packages/generated', type: 'minimal' })
  await writeFile(path.join(h.workspace, 'packages/generated/index.js'), 'export const message = "business"\n')
  await commit(h.workspace)
  const [before] = await listTemplateInstances(h.workspace)
  const metadata = path.join(h.workspace, '.repoctl')
  const retained = await snapshot(metadata)
  const plan = await planWorkspaceRemoval(h.workspace, { target: 'generated' })
  expect(plan.canApply).toBe(true)
  const guidance = plan.nextSteps.find(step => step.includes(before!.instance.id))
  expect(guidance).toContain('reported as missing')
  expect(guidance).toContain('Restore the original project')
  expect(guidance).toContain('different unowned path')
  expect(await snapshot(metadata)).toEqual(retained)

  const result = await applyWorkspaceRemovalPlan(h.workspace, plan)
  expect(result.nextSteps).toEqual(plan.nextSteps)
  expect(result.status).toBe('applied')
  expect(await listTemplateInstances(h.workspace)).toEqual([{ ...before!, targetStatus: 'missing' }])
  const removed = await checkTemplateDrift(h.workspace)
  const removedOwner = removed.owners.find(owner => owner.id === before!.instance.id)!
  expect(removedOwner).toMatchObject({ path: 'packages/generated', baseline: { status: 'available' }, local: 'drifted' })
  expect(removedOwner.files).toContainEqual(expect.objectContaining({ path: 'packages/generated', state: 'deleted' }))
  expect(await snapshot(metadata)).toEqual(retained)
  expect((await applyWorkspaceRemovalPlan(h.workspace, plan)).nextSteps).toEqual(plan.nextSteps)
  await expect(createNewProject({ cwd: h.workspace, name: 'packages/generated', type: 'minimal' })).rejects.toThrow(`retained instance ${before!.instance.id} at packages/generated`)
  await expect(access(path.join(h.workspace, 'packages/generated'))).rejects.toThrow()
  expect(await snapshot(metadata)).toEqual(retained)

  await rebuildTemplateInstanceBaseline(h.workspace, before!.instance.id, path.join(h.root, 'baseline'))
  expect(await readFile(path.join(h.root, 'baseline/index.js'), 'utf8')).toContain('"template"')
  await git(h.workspace, ['restore', '--source=HEAD', '--worktree', '--', 'packages/generated'])
  expect(await readFile(path.join(h.workspace, 'packages/generated/index.js'), 'utf8')).toContain('"business"')
  expect(await listTemplateInstances(h.workspace)).toEqual([before!])
  const restored = await checkTemplateDrift(h.workspace)
  const restoredOwner = restored.owners.find(owner => owner.id === before!.instance.id)!
  expect(restoredOwner.files.some(file => file.state === 'deleted')).toBe(false)
  expect(restoredOwner.files).toContainEqual(expect.objectContaining({ path: 'packages/generated/index.js', state: 'modified' }))
  expect(await snapshot(metadata)).toEqual(retained)
})

it('does not add instance guidance or create metadata for an unregistered package preview', async () => {
  const h = await fixture()
  const plan = await planWorkspaceRemoval(h.workspace, { target: 'old' })
  expect(plan.nextSteps.every(step => !step.includes('Template instance'))).toBe(true)
  await expect(access(path.join(h.workspace, '.repoctl'))).rejects.toThrow()
})
