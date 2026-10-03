import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import path from 'node:path'
import { loadTemplateBaseline } from '@icebreakers/monorepo-templates'
import { expect, it, vi } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist -- Exercise the delivered parameter, move, drift and upgrade APIs together.
import { applyTemplateUpgradePlan, applyWorkspaceMovePlan, checkTemplateDrift, createNewProject, listTemplateInstances, planTemplateUpgrade, planWorkspaceMove } from '../../../dist/index.mjs'
import { commit, git } from '../removal/fixture'
import { contents, fixture, write } from './fixtures'

it('reuses the original parameterized path after a workspace move with independent identities and secret exclusions', async (t) => {
  const f = await fixture(t)
  await createNewProject(f.options)
  await fs.appendFile(path.join(f.target, 'src/index.ts'), '// First business customization\n')
  const [before] = await listTemplateInstances(f.cwd)
  await git(f.cwd, ['init'])
  await commit(f.cwd)
  const destination = 'modules/moved'
  const move = await planWorkspaceMove(f.cwd, { target: `./${f.options.name}`, to: destination, name: 'moved-sample' })
  expect(move.canApply, JSON.stringify(move.blockers)).toBe(true)
  expect(JSON.stringify(move)).not.toContain('secret-value-734')
  expect((await applyWorkspaceMovePlan(f.cwd, move)).status).toBe('applied')
  const movedTarget = path.join(f.cwd, destination)
  expect(await fs.readFile(path.join(movedTarget, 'credentials.local'), 'utf8')).toBe('TOKEN=secret-value-734\n')
  await createNewProject({ ...f.options, parameters: { label: 'second', tests: false, flavor: 'plain', token: 'second-private-token' } })
  const records = (await listTemplateInstances(f.cwd)).map(record => record.instance)
  expect(records).toHaveLength(2)
  expect(new Set(records.map(instance => instance.id)).size).toBe(2)
  const moved = records.find(instance => instance.id === before!.instance.id)!
  const created = records.find(instance => instance.target === f.options.name)!
  expect(moved).toEqual({ ...before!.instance, target: destination })
  expect(created.id).not.toBe(moved.id)
  expect(created.parameters.templateValues).toEqual({ label: 'second', tests: false, flavor: 'plain' })
  for (const instance of records) {
    expect(instance.excludedPaths).toContain('credentials.local')
    if (instance.baseline.status !== 'available') {
      throw new Error('Expected a retained baseline.')
    }
    const rendered = await loadTemplateBaseline(f.cwd, instance.baseline.rendered)
    expect(rendered.files.some(file => file.path === 'credentials.local')).toBe(false)
    const original = await loadTemplateBaseline(f.cwd, instance.baseline.original)
    const baselineText = [...rendered.files, ...original.files].map(file => Buffer.from(file.content, 'base64').toString('utf8')).join('\n')
    expect(baselineText).not.toContain('secret-value-734')
    expect(baselineText).not.toContain('second-private-token')
  }
  const metadataBeforeUpgrade = await fs.readFile(path.join(f.cwd, '.repoctl/template-instances.json'), 'utf8')
  expect(metadataBeforeUpgrade).not.toContain('secret-value-734')
  expect(metadataBeforeUpgrade).not.toContain('second-private-token')
  const drift = await checkTemplateDrift(f.cwd)
  for (const instance of records) {
    const owner = drift.owners.find(owner => owner.id === instance.id)!
    expect(owner.files).toContainEqual(expect.objectContaining({ path: `${instance.target}/credentials.local`, state: 'excluded' }))
    expect(owner.files).toContainEqual(expect.objectContaining({ path: `${instance.target}/src/index.ts`, state: instance.id === moved.id ? 'modified' : 'unchanged' }))
  }
  const nextSource = path.join(f.root, 'next-package')
  await fs.mkdir(path.join(nextSource, 'templates'), { recursive: true })
  await fs.cp(path.join(f.source, 'sample'), path.join(nextSource, 'templates/custom'), { recursive: true })
  await write(nextSource, 'package.json', '{"name":"@icebreakers/monorepo-templates","version":"2.0.0"}\n')
  await write(nextSource, 'templates/custom/README.md', 'New upstream documentation\n')
  const secondBeforeUpgrade = await contents(f.target)
  await applyTemplateUpgradePlan(await planTemplateUpgrade({ cwd: f.cwd, instance: moved.id, version: '2.0.0', sourceDir: nextSource }))
  expect(await contents(f.target)).toEqual(secondBeforeUpgrade)
  expect((await listTemplateInstances(f.cwd)).find(record => record.instance.id === created.id)!.instance).toEqual(created)
  await applyTemplateUpgradePlan(await planTemplateUpgrade({ cwd: f.cwd, instance: created.id, version: '2.0.0', sourceDir: nextSource }))
  for (const instance of records) {
    expect((await planTemplateUpgrade({ cwd: f.cwd, instance: instance.id, version: '2.0.0', sourceDir: nextSource })).action).toBe('unchanged')
    expect(await fs.readFile(path.join(f.cwd, instance.target, 'README.md'), 'utf8')).toBe('New upstream documentation\n')
  }
  expect(await fs.readFile(path.join(movedTarget, 'src/index.ts'), 'utf8')).toContain('First business customization')
  expect(await fs.readFile(path.join(f.target, 'src/index.ts'), 'utf8')).toBe('export const label = "second"\n')
  expect(await fs.readFile(path.join(movedTarget, 'credentials.local'), 'utf8')).toBe('TOKEN=secret-value-734\n')
  expect(await fs.readFile(path.join(f.target, 'credentials.local'), 'utf8')).toBe('TOKEN=second-private-token\n')
  const after = (await listTemplateInstances(f.cwd)).map(record => record.instance)
  expect(after.map(instance => instance.id)).toEqual(records.map(instance => instance.id))
  expect(after.every(instance => instance.source.version === '2.0.0')).toBe(true)
  for (const instance of after) {
    if (instance.baseline.status !== 'available') {
      throw new Error('Expected the upgraded baseline.')
    }
    expect((await loadTemplateBaseline(f.cwd, instance.baseline.rendered)).files.some(file => file.path === 'credentials.local')).toBe(false)
  }
  const afterDrift = await checkTemplateDrift(f.cwd)
  expect(afterDrift.owners.find(owner => owner.id === moved.id)!.files).toContainEqual(expect.objectContaining({ path: `${destination}/src/index.ts`, state: 'modified' }))
  expect(afterDrift.owners.find(owner => owner.id === created.id)!.local).toBe('unchanged')
})

it('rolls back a reused parameterized path on registry failure without changing the moved instance', async (t) => {
  const f = await fixture(t)
  await createNewProject(f.options)
  await git(f.cwd, ['init'])
  await commit(f.cwd)
  await applyWorkspaceMovePlan(f.cwd, await planWorkspaceMove(f.cwd, { target: `./${f.options.name}`, to: 'modules/moved', name: 'moved-sample' }))
  const before = await contents(f.cwd)
  const registryFile = path.join(f.cwd, '.repoctl/template-instances.json')
  const rename = fs.rename.bind(fs)
  const spy = vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
    if (String(to) === registryFile) {
      throw new Error('Injected reused instance registry failure')
    }
    return rename(from, to)
  })
  try {
    await expect(createNewProject({ ...f.options, parameters: { ...f.options.parameters, token: 'retry-private-token' } })).rejects.toThrow('Injected reused instance registry failure')
  }
  finally {
    spy.mockRestore()
  }
  expect(await contents(f.cwd)).toEqual(before)
  await expect(fs.access(f.target)).rejects.toThrow()
  await createNewProject(f.options)
  expect(await listTemplateInstances(f.cwd)).toHaveLength(2)
})
