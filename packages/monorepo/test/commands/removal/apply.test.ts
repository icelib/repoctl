import { access, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import path from 'pathe'
import { describe, expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist -- Verify the shipped public API.
import { applyWorkspaceRemovalPlan, planWorkspaceRemoval } from '../../../dist/index.mjs'
import { commit, fixture, snapshot, writeJson } from './fixture'

describe('workspace removal application from built exports', () => {
  it('does not claim a blocked plan succeeded after the directory was manually deleted', async () => {
    const h = await fixture({ 'packages/old': {}, 'packages/keep': { dependencies: { old: 'workspace:*' } } })
    const plan = await planWorkspaceRemoval(h.workspace, { target: 'old' })
    await rm(path.join(h.workspace, 'packages/old'), { recursive: true })
    await expect(applyWorkspaceRemovalPlan(h.workspace, plan)).rejects.toThrow('blocked')
  })

  it('removes only the selected package and planned manifest fields, preserves user files and supports repeated application', async () => {
    const h = await fixture({
      'packages/old': {},
      'packages/keep': { dependencies: { old: 'workspace:*' }, scripts: { build: 'echo old' } },
    })
    await writeFile(path.join(h.workspace, 'pnpm-lock.yaml'), '# Preserve until explicit pnpm install\n')
    await commit(h.workspace)
    const before = await snapshot(h.root)
    const plan = await planWorkspaceRemoval(h.workspace, { target: 'old', removeReferences: true })
    const result = await applyWorkspaceRemovalPlan(h.workspace, plan)
    expect(result).toMatchObject({ status: 'applied', removed: ['packages/old'], changed: ['packages/keep/package.json'], cleanupPending: [] })
    await expect(access(path.join(h.workspace, 'packages/old'))).rejects.toThrow()
    const after = await snapshot(h.root)
    for (const [file, content] of Object.entries(before)) {
      if (!file.startsWith('workspace/packages/old') && file !== 'workspace/packages/keep/package.json') {
        expect(after[file]).toBe(content)
      }
    }
    expect(JSON.parse(await readFile(path.join(h.workspace, 'packages/keep/package.json'), 'utf8'))).toMatchObject({ dependencies: {}, scripts: { build: 'echo old' } })
    expect(await applyWorkspaceRemovalPlan(h.workspace, plan)).toMatchObject({ status: 'unchanged', removed: [], changed: [] })
  })

  it.each(['manifest', 'source', 'target', 'workspace-set', 'head', 'tampered'])('rejects a %s drift before deleting anything', async (mode) => {
    const h = await fixture({ 'packages/old': {}, 'packages/keep': { dependencies: { old: 'workspace:*' } } })
    const plan = await planWorkspaceRemoval(h.workspace, { target: 'old', removeReferences: true })
    if (mode === 'manifest') {
      await writeJson(path.join(h.workspace, 'packages/keep/package.json'), { name: 'keep', concurrent: true })
    }
    else if (mode === 'source') {
      await writeFile(path.join(h.workspace, 'docs/guide.md'), 'changed configuration references')
    }
    else if (mode === 'target') {
      await writeFile(path.join(h.workspace, 'packages/old/index.js'), 'new source')
    }
    else if (mode === 'workspace-set') {
      await writeJson(path.join(h.workspace, 'packages/new/package.json'), { name: 'new' })
    }
    else if (mode === 'head') {
      await commit(h.workspace)
    }
    else {
      plan.review.matches = []
      plan.nextSteps = []
    }
    const before = await snapshot(h.root)
    await expect(applyWorkspaceRemovalPlan(h.workspace, plan)).rejects.toThrow('stale')
    expect(await snapshot(h.root)).toEqual(before)
  })

  it('treats special path characters literally within a pnpm workspace nested below the Git root', async () => {
    const target = 'packages/old [1] $(touch sentinel)'
    const h = await fixture({ [target]: { name: 'old' }, 'packages/old 1 sentinel': { name: 'keep' } }, { nested: true })
    const plan = await planWorkspaceRemoval(h.workspace, { target: `./${target}` })
    expect(plan.canApply).toBe(true)
    expect(plan.review.scanned).toContain('docs/guide.md')
    await applyWorkspaceRemovalPlan(h.workspace, plan)
    expect(await readFile(path.join(h.workspace, 'packages/old 1 sentinel/index.js'), 'utf8')).toContain('42')
    await expect(access(path.join(h.workspace, 'sentinel'))).rejects.toThrow()
  })

  it('refuses a symlinked recovery ancestor and leaves external cache contents untouched', async () => {
    const h = await fixture({ 'packages/old': {}, 'packages/keep': { dependencies: { old: 'workspace:*' } } })
    await mkdir(path.join(h.home, 'external-cache'))
    await writeFile(path.join(h.home, 'external-cache/keep'), 'external')
    await symlink(path.join(h.home, 'external-cache'), path.join(h.workspace, 'node_modules'), 'junction')
    const plan = await planWorkspaceRemoval(h.workspace, { target: 'old', removeReferences: true })
    const before = await snapshot(h.root)
    await expect(applyWorkspaceRemovalPlan(h.workspace, plan)).rejects.toThrow('Unsafe cleanup target')
    expect(await snapshot(h.root)).toEqual(before)
  })
})
