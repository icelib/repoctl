import fs from 'node:fs/promises'
import path from 'node:path'
import { expect, it, vi } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist
import { applyTemplateLinkPlan, createNewProject, listTemplateInstances, planTemplateLink } from '../../../dist/index.mjs'
import { contents, fixture, write } from './fixtures'

it('rejects secret parameters, path escapes and historical source links', async (t) => {
  const f = await fixture(t)
  await expect(planTemplateLink({ ...f.options, parameters: { token: 'do-not-store' } as never })).rejects.toThrow('non-secret generation parameters')
  await expect(planTemplateLink({ ...f.options, target: '../outside' })).rejects.toThrow('Unsafe')
  const outside = path.join(f.root, 'outside')
  await fs.mkdir(outside)
  await fs.symlink(outside, path.join(f.sourceDir, 'templates/tsdown/external'), 'junction')
  await expect(planTemplateLink(f.options)).rejects.toThrow('link')
  expect(await fs.readdir(outside)).toEqual([])
  expect(await listTemplateInstances(f.cwd)).toEqual([])
})

it('refuses a metadata symlink without writing outside the workspace or touching business files', async (t) => {
  const f = await fixture(t)
  const outside = path.join(f.root, 'outside')
  await fs.mkdir(outside)
  await fs.symlink(outside, path.join(f.cwd, '.repoctl'), 'junction')
  const before = await contents(path.join(f.cwd, f.target))
  await expect(planTemplateLink(f.options)).rejects.toThrow('Symlinks')
  expect(await contents(path.join(f.cwd, f.target))).toEqual(before)
  expect(await fs.readdir(outside)).toEqual([])
})

it('leaves an explicit recoverable generated project when registration is locked', async (t) => {
  const f = await fixture(t)
  await write(f.cwd, '.repoctl/template-instances.lock', 'unknown writer\n')
  await expect(createNewProject({ cwd: f.cwd, name: 'packages/recover' })).rejects.toThrow(`Registry recovery path: ${path.join(f.cwd, '.repoctl/template-instances.json')}`)
  expect(JSON.parse(await fs.readFile(path.join(f.cwd, 'packages/recover/package.json'), 'utf8')).name).toBe('recover')
  expect(await listTemplateInstances(f.cwd)).toEqual([])
  expect(await fs.readFile(path.join(f.cwd, '.repoctl/template-instances.lock'), 'utf8')).toBe('unknown writer\n')
})

it('rolls back newly written metadata when the atomic registry commit fails', async (t) => {
  const f = await fixture(t)
  const plan = await planTemplateLink(f.options)
  const before = await contents(path.join(f.cwd, f.target))
  const rename = fs.rename
  const fault = vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
    if (String(to).endsWith('template-instances.json')) {
      throw new Error('injected metadata commit failure')
    }
    return rename(from, to)
  })
  try {
    await expect(applyTemplateLinkPlan(plan)).rejects.toThrow('injected metadata commit failure')
  }
  finally {
    fault.mockRestore()
  }
  expect(await listTemplateInstances(f.cwd)).toEqual([])
  expect(await contents(path.join(f.cwd, f.target))).toEqual(before)
  expect(await contents(path.join(f.cwd, '.repoctl'))).toEqual({})
  await applyTemplateLinkPlan(plan)
  expect(await listTemplateInstances(f.cwd)).toHaveLength(1)
})

it('detects source and generation failures before successful registration', async (t) => {
  const f = await fixture(t)
  await write(f.cwd, 'repoctl.config.ts', `export default { commands: { create: { templatesDir: ${JSON.stringify(path.join(f.root, 'missing-templates'))} } } }\n`)
  await expect(createNewProject({ cwd: f.cwd, name: 'packages/never-created' })).rejects.toThrow()
  expect(await listTemplateInstances(f.cwd)).toEqual([])
  await expect(fs.access(path.join(f.cwd, 'packages/never-created'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('does not remove a replacement lock owned by another operation', async (t) => {
  const f = await fixture(t)
  const plan = await planTemplateLink(f.options)
  const lockPath = path.join(f.cwd, '.repoctl/template-instances.lock')
  const rename = fs.rename
  const replacement = 'another-process:independent-owner\n'
  const replaceLock = vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
    if (String(to).endsWith('template-instances.json')) {
      await fs.rm(lockPath)
      await fs.writeFile(lockPath, replacement)
    }
    return rename(from, to)
  })
  try {
    await applyTemplateLinkPlan(plan)
  }
  finally {
    replaceLock.mockRestore()
  }
  expect(await fs.readFile(lockPath, 'utf8')).toBe(replacement)
  await expect(applyTemplateLinkPlan(await planTemplateLink(f.options))).rejects.toThrow('registry is locked')
})

it('rejects overlapping targets in a manually modified registry on every read', async (t) => {
  const f = await fixture(t)
  await applyTemplateLinkPlan(await planTemplateLink(f.options))
  const registryPath = path.join(f.cwd, '.repoctl/template-instances.json')
  const registry = JSON.parse(await fs.readFile(registryPath, 'utf8'))
  registry.instances.push({ ...registry.instances[0], id: 'f'.repeat(24), target: `${f.target}/nested` })
  await fs.writeFile(registryPath, JSON.stringify(registry))
  await expect(listTemplateInstances(f.cwd)).rejects.toThrow('Overlapping')
  await expect(planTemplateLink(f.options)).rejects.toThrow('Overlapping')
})
