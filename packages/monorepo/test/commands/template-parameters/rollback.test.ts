import fs from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import path from 'node:path'
import { applyCreateNewProjectPlan, listTemplateInstances, resolveCreateNewProjectPlan } from '@icebreakers/monorepo'
import { expect, it, vi } from 'vitest'
import { contents, fixture, write } from './fixtures'

it('restores workspace files and removes only owned output when registry commit fails', async (t) => {
  const f = await fixture(t)
  const before = await contents(f.cwd)
  const plan = await resolveCreateNewProjectPlan(f.options)
  const rename = fs.rename.bind(fs)
  const spy = vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
    if (String(to).endsWith('template-instances.json')) {
      throw new Error('Injected registry failure')
    }
    return rename(from, to)
  })
  try {
    await expect(applyCreateNewProjectPlan(plan, false)).rejects.toThrow('Injected registry failure')
  }
  finally {
    spy.mockRestore()
  }
  expect(await contents(f.cwd)).toEqual(before)
  await expect(fs.access(f.target)).rejects.toThrow()
  await applyCreateNewProjectPlan(plan, false)
  expect(await listTemplateInstances(f.cwd)).toHaveLength(1)
})

it('preserves concurrent edits and points to a recoverable target on registry failure', async (t) => {
  const f = await fixture(t)
  const plan = await resolveCreateNewProjectPlan(f.options)
  const rename = fs.rename.bind(fs)
  const spy = vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
    if (String(to).endsWith('template-instances.json')) {
      await write(f.target, 'src/index.ts', 'concurrent edit\n')
      throw new Error('Injected registry failure')
    }
    return rename(from, to)
  })
  try {
    await expect(applyCreateNewProjectPlan(plan, false)).rejects.toThrow('recovery needs attention')
  }
  finally {
    spy.mockRestore()
  }
  expect(await fs.readFile(path.join(f.target, 'src/index.ts'), 'utf8')).toBe('concurrent edit\n')
  expect(await listTemplateInstances(f.cwd)).toEqual([])
})

it('preserves a concurrently replaced output even when its bytes match the generated file', async (t) => {
  const f = await fixture(t)
  const plan = await resolveCreateNewProjectPlan(f.options)
  const rename = fs.rename.bind(fs)
  const filename = path.join(f.target, 'src/index.ts')
  let replacementIdentity: bigint | undefined
  const spy = vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
    if (String(to).endsWith('template-instances.json')) {
      const content = await fs.readFile(filename)
      await rename(filename, path.join(f.root, 'owned-file'))
      await fs.writeFile(filename, content)
      replacementIdentity = (await fs.lstat(filename, { bigint: true })).ino
      throw new Error('Injected registry failure')
    }
    return rename(from, to)
  })
  try {
    await expect(applyCreateNewProjectPlan(plan, false)).rejects.toThrow('recovery needs attention')
  }
  finally {
    spy.mockRestore()
  }
  expect((await fs.lstat(filename, { bigint: true })).ino).toBe(replacementIdentity)
  expect(await fs.readFile(filename, 'utf8')).toBe('export const label = "hello"\n')
  expect(await listTemplateInstances(f.cwd)).toEqual([])
})

it('does not chmod an external inode linked over an owned output between path validation and open', async (t) => {
  const f = await fixture(t)
  const plan = await resolveCreateNewProjectPlan(f.options)
  const filename = path.join(f.target, 'src/index.ts')
  const external = path.join(f.root, 'external-file')
  await fs.writeFile(external, 'external contents\n', { mode: 0o400 })
  const original = await fs.lstat(external)
  const open = fs.open.bind(fs)
  let replaced = false
  const spy = vi.spyOn(fs, 'open').mockImplementation(async (file, flags, mode) => {
    if (!replaced && path.resolve(String(file)) === path.resolve(filename) && flags === 'r') {
      replaced = true
      await fs.rename(filename, path.join(f.root, 'owned-file'))
      await fs.link(external, filename)
    }
    return open(file, flags, mode)
  })
  syncBuiltinESMExports()
  try {
    await expect(applyCreateNewProjectPlan(plan, false)).rejects.toThrow('recovery needs attention')
  }
  finally {
    spy.mockRestore()
    syncBuiltinESMExports()
  }
  expect(replaced).toBe(true)
  expect((await fs.lstat(external)).mode).toBe(original.mode)
  expect(await fs.readFile(external, 'utf8')).toBe('external contents\n')
  expect(await listTemplateInstances(f.cwd)).toEqual([])
})
