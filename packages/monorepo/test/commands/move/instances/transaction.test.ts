import fs from 'node:fs/promises'
import path from 'pathe'
import { expect, it, vi } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist -- Registry commit failure must recover actual delivered moves.
import { applyWorkspaceMovePlan, listTemplateInstances, planWorkspaceMove } from '../../../../dist/index.mjs'
import { registeredFixture } from './fixture'

it('rolls the directory and manifest bytes back when the registry cannot commit', async () => {
  const h = await registeredFixture()
  const plan = await planWorkspaceMove(h.workspace, { target: 'old', to: 'libs/core', name: 'core' })
  const beforeRegistry = await fs.readFile(h.registryFile, 'utf8')
  const beforeManifest = await fs.readFile(path.join(h.targetDir, 'package.json'), 'utf8')
  const rename = fs.rename.bind(fs)
  let failed = false
  const spy = vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
    if (String(to) === h.registryFile) {
      failed = true
      await fs.access(path.join(h.workspace, 'libs/core/business.txt'))
      await fs.access(path.join(h.workspace, '.repoctl/template-instances.lock'))
      throw new Error('Injected registry commit failure')
    }
    return rename(from, to)
  })
  try {
    await expect(applyWorkspaceMovePlan(h.workspace, plan)).rejects.toThrow('Injected registry commit failure')
  }
  finally {
    spy.mockRestore()
  }
  expect(failed).toBe(true)
  expect(await fs.readFile(h.registryFile, 'utf8')).toBe(beforeRegistry)
  expect(await fs.readFile(path.join(h.targetDir, 'package.json'), 'utf8')).toBe(beforeManifest)
  expect(await fs.readFile(path.join(h.targetDir, 'business.txt'), 'utf8')).toContain('business implementation')
  await expect(fs.access(path.join(h.workspace, 'libs'))).rejects.toThrow()
  await expect(fs.access(path.join(h.workspace, '.repoctl/template-instances.lock'))).rejects.toThrow()
  expect((await listTemplateInstances(h.workspace))[0]!.targetStatus).toBe('present')
})

it('holds the instance lock through directory mutation and rollback', async () => {
  const h = await registeredFixture()
  const plan = await planWorkspaceMove(h.workspace, { target: 'old', to: 'libs/core', name: 'core' })
  const rename = fs.rename.bind(fs)
  const staged = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const spy = vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
    if (String(to) === h.registryFile) {
      staged.resolve()
      await release.promise
      throw new Error('Stop before registry commit')
    }
    return rename(from, to)
  })
  const operation = applyWorkspaceMovePlan(h.workspace, plan).catch((error: Error) => error)
  try {
    await staged.promise
    await expect(fs.open(path.join(h.workspace, '.repoctl/template-instances.lock'), 'wx')).rejects.toThrow('EEXIST')
    expect(await fs.readFile(path.join(h.workspace, 'libs/core/business.txt'), 'utf8')).toContain('business implementation')
  }
  finally {
    release.resolve()
    await operation
    spy.mockRestore()
  }
  expect(await operation).toHaveProperty('message', 'Stop before registry commit')
  await fs.access(path.join(h.targetDir, 'business.txt'))
})

it('retains concurrent edits and recovery backups if registry failure prevents a complete rollback', async () => {
  const h = await registeredFixture()
  const plan = await planWorkspaceMove(h.workspace, { target: 'old', to: 'libs/core', name: 'core' })
  const registry = await fs.readFile(h.registryFile, 'utf8')
  const rename = fs.rename.bind(fs)
  const destination = path.join(h.workspace, 'libs/core')
  const spy = vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
    if (String(to) === h.registryFile) {
      await fs.writeFile(path.join(destination, 'package.json'), '{"name":"concurrent-business-edit"}\n')
      throw new Error('Registry commit denied')
    }
    return rename(from, to)
  })
  let failure: unknown
  try {
    failure = await applyWorkspaceMovePlan(h.workspace, plan).catch(error => error)
  }
  finally {
    spy.mockRestore()
  }
  expect(failure).toBeInstanceOf(AggregateError)
  expect(failure).toHaveProperty('message', expect.stringContaining(destination))
  expect(await fs.readFile(h.registryFile, 'utf8')).toBe(registry)
  expect(await fs.readFile(path.join(destination, 'package.json'), 'utf8')).toContain('concurrent-business-edit')
  const backup = (await fs.readdir(destination)).find(filename => filename.startsWith('package.json.repoctl-move-') && filename.endsWith('.bak'))!
  expect(backup).toBeDefined()
  expect(JSON.parse(await fs.readFile(path.join(destination, backup), 'utf8')).name).toBe('old')
})

it('reports a committed move and the exact retained registry lock when lock cleanup fails', async () => {
  const h = await registeredFixture()
  const plan = await planWorkspaceMove(h.workspace, { target: 'old', to: 'libs/core', name: 'core' })
  const lock = path.join(h.workspace, '.repoctl/template-instances.lock')
  const rm = fs.rm.bind(fs)
  const spy = vi.spyOn(fs, 'rm').mockImplementation(async (filename, options) => {
    if (String(filename) === lock) {
      throw new Error('Injected registry lock cleanup failure')
    }
    return rm(filename, options)
  })
  let result
  try {
    result = await applyWorkspaceMovePlan(h.workspace, plan)
  }
  finally {
    spy.mockRestore()
  }
  expect(result).toMatchObject({ status: 'applied', cleanupPending: [lock] })
  expect((await listTemplateInstances(h.workspace))[0]!.instance).toEqual({ ...h.instance, target: 'libs/core' })
  expect(JSON.parse(await fs.readFile(path.join(h.workspace, 'libs/core/package.json'), 'utf8')).name).toBe('core')
  await expect(applyWorkspaceMovePlan(h.workspace, plan)).rejects.toThrow('registry is locked')
  await fs.rm(lock)
  expect((await applyWorkspaceMovePlan(h.workspace, plan)).status).toBe('unchanged')
})
