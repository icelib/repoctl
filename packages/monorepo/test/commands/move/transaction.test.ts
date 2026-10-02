import { access, lstat, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'pathe'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { applyWorkspaceMovePlan } from '@/commands/workspace/move/apply'
import { planWorkspaceMove } from '@/commands/workspace/move/plan'
import { fixture, snapshot } from './fixture'

const hooks = vi.hoisted(() => ({ rename: vi.fn(), rm: vi.fn(), unlink: vi.fn() }))
vi.mock('node:fs/promises', async original => ({ ...await original<typeof import('node:fs/promises')>(), ...hooks }))
const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
function resetHooks() {
  hooks.rename.mockReset().mockImplementation(actual.rename)
  hooks.rm.mockReset().mockImplementation(actual.rm)
  hooks.unlink.mockReset().mockImplementation(actual.unlink)
}
beforeEach(resetHooks)
afterEach(resetHooks)

async function withConsumers() {
  return fixture({ '.': { dependencies: { old: 'workspace:*' } }, 'packages/old': {}, 'packages/app': { dependencies: { old: 'workspace:*' } } })
}

it.each(['EXDEV', 'first replacement', 'later replacement'])('restores original bytes and paths after %s', async (failure) => {
  const h = await withConsumers()
  const plan = await planWorkspaceMove(h.workspace, { target: 'old', to: 'libs/new', name: 'new' })
  const before = await snapshot(h.workspace)
  hooks.rename.mockImplementation(async (source: string, target: string) => {
    if ((failure === 'EXDEV' && source === path.join(h.workspace, 'packages/old'))
      || (failure === 'first replacement' && source.endsWith('.tmp') && target === path.join(h.workspace, 'package.json'))
      || (failure === 'later replacement' && source.endsWith('.tmp') && target === path.join(h.workspace, 'packages/app/package.json'))) {
      throw new Error(failure)
    }
    return actual.rename(source, target)
  })
  await expect(applyWorkspaceMovePlan(h.workspace, plan)).rejects.toThrow(failure)
  const after = await snapshot(h.workspace)
  expect(Object.keys(after)).toEqual(Object.keys(before))
  for (const [file, content] of Object.entries(before)) {
    const actual = after[file]!
    if (plan.files.some(item => item.path === file)) {
      expect(actual.slice(actual.indexOf(':') + 1)).toBe(content.slice(content.indexOf(':') + 1))
    }
    else {
      expect(actual).toBe(content)
    }
  }
})

it('preserves concurrent consumer edits and retained original backups at their reported paths', async () => {
  const h = await withConsumers()
  const plan = await planWorkspaceMove(h.workspace, { target: 'old', to: 'libs/new', name: 'new' })
  hooks.rename.mockImplementation(async (source: string, target: string) => {
    if (source.endsWith('.tmp') && target === path.join(h.workspace, 'packages/app/package.json')) {
      await writeFile(path.join(h.workspace, 'package.json'), '{"concurrent":true}\n')
      throw new Error('later replacement failed')
    }
    return actual.rename(source, target)
  })
  const error = await applyWorkspaceMovePlan(h.workspace, plan).catch((error: Error) => error)
  expect(error).toBeInstanceOf(AggregateError)
  const backup = (await readdir(h.workspace)).find(file => file.endsWith('.bak'))!
  expect(error).toHaveProperty('message', expect.stringContaining(path.join(h.workspace, backup)))
  expect(await readFile(path.join(h.workspace, backup), 'utf8')).toBe(plan.files.find(file => file.path === 'package.json')!.before)
  expect(await readFile(path.join(h.workspace, 'package.json'), 'utf8')).toContain('concurrent')
  await access(path.join(h.workspace, 'libs/new/index.js'))
})

it('retains both directories when another process recreates the original path', async () => {
  const h = await withConsumers()
  const plan = await planWorkspaceMove(h.workspace, { target: 'old', to: 'libs/new', name: 'new' })
  hooks.rename.mockImplementation(async (source: string, target: string) => {
    await actual.rename(source, target)
    if (source === path.join(h.workspace, 'packages/old')) {
      await mkdir(source)
      await writeFile(path.join(source, 'user.txt'), 'concurrent directory')
    }
  })
  await expect(applyWorkspaceMovePlan(h.workspace, plan)).rejects.toThrow('recover retained originals')
  expect(await readFile(path.join(h.workspace, 'packages/old/user.txt'), 'utf8')).toBe('concurrent directory')
  expect(await readFile(path.join(h.workspace, 'libs/new/index.js'), 'utf8')).toContain('42')
})

it('reports committed moves accurately if only backup cleanup fails', async () => {
  const h = await withConsumers()
  const plan = await planWorkspaceMove(h.workspace, { target: 'old', to: 'libs/new', name: 'new' })
  hooks.rm.mockImplementation(async (file: string, options: Parameters<typeof actual.rm>[1]) => {
    if (file.includes('.repoctl-move-') && file.endsWith('.bak')) {
      throw new Error('cleanup denied')
    }
    return actual.rm(file, options)
  })
  const result = await applyWorkspaceMovePlan(h.workspace, plan)
  expect(result.status).toBe('applied')
  expect(result.cleanupPending.length).toBe(plan.files.length)
  await Promise.all(result.cleanupPending.map(file => access(file)))
  expect(await readFile(path.join(h.workspace, 'libs/new/package.json'), 'utf8')).toContain('"new"')
  expect(await applyWorkspaceMovePlan(h.workspace, plan)).toMatchObject({ status: 'unchanged' })
})

it('locks replay checks until an earlier rename has finished verification and rollback', async () => {
  const h = await fixture()
  const plan = await planWorkspaceMove(h.workspace, { target: 'old', name: 'new' })
  const staged = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  hooks.rename.mockImplementation(async (source: string, target: string) => {
    await actual.rename(source, target)
    if (source.endsWith('.tmp') && target === path.join(h.workspace, 'packages/old/package.json')) {
      staged.resolve()
      await release.promise
    }
  })
  const first = applyWorkspaceMovePlan(h.workspace, plan).catch((error: Error) => error)
  await staged.promise
  try {
    await expect(applyWorkspaceMovePlan(h.workspace, plan)).rejects.toThrow('locked')
    await writeFile(path.join(h.workspace, 'docs/guide.md'), 'concurrent documentation\n')
  }
  finally {
    release.resolve()
  }
  expect(await first).toHaveProperty('message', expect.stringContaining('Move input changed'))
  expect(await readFile(path.join(h.workspace, 'packages/old/package.json'), 'utf8')).toBe(plan.files[0]!.before)
  expect(await readFile(path.join(h.workspace, 'docs/guide.md'), 'utf8')).toBe('concurrent documentation\n')
  await expect(access(path.join(h.workspace, '.repoctl/workspace-move.lock'))).rejects.toThrow()
})

it('preserves a replacement lock directory after releasing its own lock', async () => {
  const h = await fixture()
  const plan = await planWorkspaceMove(h.workspace, { target: 'old', name: 'new' })
  const directory = path.join(h.workspace, '.repoctl')
  hooks.unlink.mockImplementation(async (filename: string) => {
    await actual.unlink(filename)
    if (filename === path.join(directory, 'workspace-move.lock')) {
      await actual.rename(directory, `${directory}.retained`)
      await mkdir(directory)
    }
  })
  expect(await applyWorkspaceMovePlan(h.workspace, plan)).toMatchObject({ status: 'applied' })
  expect((await lstat(directory)).isDirectory()).toBe(true)
  expect((await lstat(`${directory}.retained`)).isDirectory()).toBe(true)
})
