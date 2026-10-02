import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'pathe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyWorkspaceRemovalPlan } from '@/commands/workspace/remove/apply'
import { planWorkspaceRemoval } from '@/commands/workspace/remove/plan'
import { fixture, snapshot } from './fixture'

const hooks = vi.hoisted(() => ({ rename: vi.fn(), rm: vi.fn() }))
vi.mock('node:fs/promises', async original => ({ ...await original<typeof import('node:fs/promises')>(), ...hooks }))
const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')

function resetHooks() {
  hooks.rename.mockReset().mockImplementation(actual.rename)
  hooks.rm.mockReset().mockImplementation(actual.rm)
}
beforeEach(resetHooks)
afterEach(resetHooks)

async function withConsumers() {
  return fixture({
    '.': { dependencies: { old: 'workspace:*' } },
    'packages/old': {},
    'packages/keep': { dependencies: { old: 'workspace:*' } },
  })
}

describe('workspace removal transaction recovery', () => {
  it.each(['EXDEV', 'first replacement', 'later replacement'])('restores the exact original tree after %s failure', async (failure) => {
    const h = await withConsumers()
    const plan = await planWorkspaceRemoval(h.workspace, { target: 'old', removeReferences: true })
    const before = await snapshot(h.root)
    hooks.rename.mockImplementation(async (source: string, target: string) => {
      if ((failure === 'EXDEV' && source === path.join(h.workspace, 'packages/old'))
        || (failure === 'first replacement' && source.endsWith('.tmp') && target === path.join(h.workspace, 'package.json'))
        || (failure === 'later replacement' && source.endsWith('.tmp') && target === path.join(h.workspace, 'packages/keep/package.json'))) {
        throw Object.assign(new Error(failure), { code: failure === 'EXDEV' ? 'EXDEV' : 'EACCES' })
      }
      return actual.rename(source, target)
    })
    await expect(applyWorkspaceRemovalPlan(h.workspace, plan)).rejects.toThrow(failure)
    const after = await snapshot(h.root)
    expect(Object.keys(after)).toEqual(Object.keys(before))
    for (const [file, content] of Object.entries(before)) {
      if (plan.files.some(item => file === `workspace/${item.path}`)) {
        const separator = content.indexOf(':')
        const restored = after[file]!
        // Filesystem timestamp setters can round below one millisecond.
        expect(Math.abs(Number(restored.slice(0, restored.indexOf(':'))) - Number(content.slice(0, separator)))).toBeLessThan(1)
        expect(restored.slice(restored.indexOf(':') + 1)).toBe(content.slice(separator + 1))
      }
      else {
        expect(after[file]).toBe(content)
      }
    }
  })

  it('preserves a concurrent consumer edit and reports its exact original backup', async () => {
    const h = await withConsumers()
    const plan = await planWorkspaceRemoval(h.workspace, { target: 'old', removeReferences: true })
    const concurrent = '{"name":"fixture","private":true,"concurrent":true}\n'
    hooks.rename.mockImplementation(async (source: string, target: string) => {
      if (source.endsWith('.tmp') && target === path.join(h.workspace, 'packages/keep/package.json')) {
        await writeFile(path.join(h.workspace, 'package.json'), concurrent)
        throw new Error('replacement failed')
      }
      return actual.rename(source, target)
    })
    const error = await applyWorkspaceRemovalPlan(h.workspace, plan).catch((error: Error) => error)
    expect(error).toBeInstanceOf(AggregateError)
    const backup = (await readdir(h.workspace)).find(file => file.endsWith('.bak'))!
    expect(error).toHaveProperty('message', expect.stringContaining(path.join(h.workspace, backup)))
    expect(await readFile(path.join(h.workspace, 'package.json'), 'utf8')).toBe(concurrent)
    expect(await readFile(path.join(h.workspace, backup), 'utf8')).toBe(plan.files[0]!.before)
    await access(path.join(h.workspace, 'packages/old/index.js'))
  })

  it('preserves a new directory at the target and retains the original directory for manual recovery', async () => {
    const h = await withConsumers()
    const plan = await planWorkspaceRemoval(h.workspace, { target: 'old', removeReferences: true })
    let recovery = ''
    hooks.rename.mockImplementation(async (source: string, target: string) => {
      await actual.rename(source, target)
      if (source === path.join(h.workspace, 'packages/old')) {
        recovery = target
        await mkdir(source)
        await writeFile(path.join(source, 'concurrent.txt'), 'new directory')
      }
    })
    await expect(applyWorkspaceRemovalPlan(h.workspace, plan)).rejects.toThrow('recover retained originals')
    expect(await readFile(path.join(h.workspace, 'packages/old/concurrent.txt'), 'utf8')).toBe('new directory')
    expect(await readFile(path.join(recovery, 'index.js'), 'utf8')).toContain('42')
    expect(await readFile(path.join(h.workspace, 'package.json'), 'utf8')).toBe(plan.files[0]!.before)
  })

  it('restores a concurrently edited quarantined directory before commit', async () => {
    const h = await withConsumers()
    const plan = await planWorkspaceRemoval(h.workspace, { target: 'old', removeReferences: true })
    let recovery = ''
    hooks.rename.mockImplementation(async (source: string, target: string) => {
      await actual.rename(source, target)
      if (source === path.join(h.workspace, 'packages/old')) {
        recovery = target
      }
      if (source.endsWith('.tmp')) {
        await writeFile(path.join(recovery, 'index.js'), 'concurrent target edit')
      }
    })
    await expect(applyWorkspaceRemovalPlan(h.workspace, plan)).rejects.toThrow('before the removal committed')
    expect(await readFile(path.join(h.workspace, 'packages/old/index.js'), 'utf8')).toBe('concurrent target edit')
    expect(await readFile(path.join(h.workspace, 'package.json'), 'utf8')).toBe(plan.files[0]!.before)
  })

  it('rejects an identical concurrent plan until verification and rollback finish', async () => {
    const h = await withConsumers()
    const plan = await planWorkspaceRemoval(h.workspace, { target: 'old', removeReferences: true })
    const paused = Promise.withResolvers<void>()
    const resume = Promise.withResolvers<void>()
    let recovery = ''
    hooks.rename.mockImplementation(async (source: string, target: string) => {
      await actual.rename(source, target)
      if (source === path.join(h.workspace, 'packages/old')) {
        recovery = target
      }
      if (source.endsWith('.tmp') && target === path.join(h.workspace, 'packages/keep/package.json')) {
        paused.resolve()
        await resume.promise
      }
    })
    const first = applyWorkspaceRemovalPlan(h.workspace, plan).catch((error: Error) => error)
    await paused.promise
    try {
      await expect(applyWorkspaceRemovalPlan(h.workspace, plan)).rejects.toThrow('locked')
      await writeFile(path.join(recovery, 'index.js'), 'concurrent target edit')
    }
    finally {
      resume.resolve()
    }
    expect(await first).toHaveProperty('message', expect.stringContaining('before the removal committed'))
    for (const file of plan.files) {
      expect(await readFile(path.join(h.workspace, file.path), 'utf8')).toBe(file.before)
    }
    expect(await readFile(path.join(h.workspace, 'packages/old/index.js'), 'utf8')).toBe('concurrent target edit')
    await expect(access(path.join(h.workspace, '.repoctl/workspace-remove.lock'))).rejects.toThrow()
  })

  it('reports applied with cleanupPending when only post-commit quarantine cleanup fails', async () => {
    const h = await withConsumers()
    const plan = await planWorkspaceRemoval(h.workspace, { target: 'old', removeReferences: true })
    hooks.rm.mockImplementation(async (file: string, options: Parameters<typeof actual.rm>[1]) => {
      if (file.includes('/repoctl/removals/') && file.endsWith('/package')) {
        throw new Error('cleanup denied')
      }
      return actual.rm(file, options)
    })
    const result = await applyWorkspaceRemovalPlan(h.workspace, plan)
    expect(result.status).toBe('applied')
    expect(result.cleanupPending).toHaveLength(1)
    expect(result.cleanupPending[0]).toContain('/node_modules/.cache/repoctl/removals/remove-')
    await expect(access(path.join(h.workspace, 'packages/old'))).rejects.toThrow()
    await access(path.join(result.cleanupPending[0]!, 'package/index.js'))
    expect(JSON.parse(await readFile(path.join(h.workspace, 'package.json'), 'utf8')).dependencies).toEqual({})
    expect(await applyWorkspaceRemovalPlan(h.workspace, plan)).toMatchObject({ status: 'unchanged' })
  })
})
