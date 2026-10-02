import fs from 'node:fs/promises'
import path from 'node:path'
import { scaffoldWorkspace } from '@icebreakers/monorepo-templates'
import { expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist
import { createNewProject, listTemplateInstances, rebuildTemplateInstanceBaseline, relocateTemplateInstance } from '../../../dist/index.mjs'
import { contents, fixture, write } from './fixtures'

it('registers independent new instances only after rendering and retains raw and transformed layers', async (t) => {
  const f = await fixture(t)
  await createNewProject({ cwd: f.cwd, name: 'packages/one', type: 'tsdown' })
  await createNewProject({ cwd: f.cwd, name: 'packages/two', type: 'tsdown', renameJson: true })
  const records = await listTemplateInstances(f.cwd)
  expect(records).toHaveLength(2)
  expect(new Set(records.map(record => record.instance.id)).size).toBe(2)
  expect(records.every(record => record.targetStatus === 'present' && record.baselineStatus === 'available')).toBe(true)
  expect(records[0]!.instance.source).toMatchObject({ kind: 'package', packageName: '@icebreakers/monorepo-templates', digest: expect.stringMatching(/^[a-f0-9]{64}$/u) })
  expect(records[1]!.instance.parameters).toEqual({ packageName: 'two', renameJson: true })
  const root = path.join(f.root, 'reconstructed')
  await rebuildTemplateInstanceBaseline(f.cwd, records[1]!.instance.id, root)
  expect(await contents(root)).toEqual(await contents(path.join(f.cwd, 'packages/two')))
  expect(await fs.readFile(path.join(root, 'package.mock.json'), 'utf8')).toContain('"name": "two"')
  const registry = await fs.readFile(path.join(f.cwd, '.repoctl/template-instances.json'), 'utf8')
  expect(registry).not.toContain(f.root)
  expect(registry).not.toContain('latest')
  await expect(createNewProject({ cwd: f.cwd, name: 'packages/one' })).rejects.toThrow('already exists')
  expect(await fs.readFile(path.join(f.cwd, '.repoctl/template-instances.json'), 'utf8')).toBe(registry)
})

it('registers workspace-copy instances together and does not register when final transformations fail', async (t) => {
  const f = await fixture(t)
  const copied = path.join(f.root, 'copied')
  await scaffoldWorkspace({ targetDir: copied, templateKeys: ['tsdown', 'cli'], includeAssets: false })
  expect((await listTemplateInstances(copied)).map(item => item.instance.generator.profile)).toEqual(['workspace-copy-v1', 'workspace-copy-v1'])
  const failed = path.join(f.root, 'failed')
  await expect(scaffoldWorkspace({
    targetDir: failed,
    templateKeys: ['tsdown'],
    includeAssets: false,
    afterScaffold: async () => { throw new Error('injected root rewrite failure') },
  })).rejects.toThrow('injected root rewrite failure')
  expect(await listTemplateInstances(failed)).toEqual([])
})

it('reports renamed instances as missing until an identical destination is explicitly associated', async (t) => {
  const f = await fixture(t)
  await createNewProject({ cwd: f.cwd, name: 'packages/one' })
  const [record] = await listTemplateInstances(f.cwd)
  await fs.rename(path.join(f.cwd, 'packages/one'), path.join(f.cwd, 'packages/renamed'))
  expect((await listTemplateInstances(f.cwd))[0]!.targetStatus).toBe('missing')
  await expect(createNewProject({ cwd: f.cwd, name: 'packages/one' })).rejects.toThrow('already owned')
  await expect(fs.access(path.join(f.cwd, 'packages/one'))).rejects.toThrow()
  const before = await fs.readFile(path.join(f.cwd, '.repoctl/template-instances.json'), 'utf8')
  const plan = await relocateTemplateInstance(f.cwd, record!.instance.id, 'packages/renamed')
  expect(plan.applied).toBe(false)
  expect(await fs.readFile(path.join(f.cwd, '.repoctl/template-instances.json'), 'utf8')).toBe(before)
  await write(f.cwd, 'packages/renamed/new-business.txt', 'Unverified identity\n')
  await expect(relocateTemplateInstance(f.cwd, record!.instance.id, 'packages/renamed', true)).rejects.toThrow('same instance')
  await fs.rm(path.join(f.cwd, 'packages/renamed/new-business.txt'))
  await relocateTemplateInstance(f.cwd, record!.instance.id, 'packages/renamed', true)
  expect((await listTemplateInstances(f.cwd))[0]!.instance).toMatchObject({ id: record!.instance.id, target: 'packages/renamed' })
})
