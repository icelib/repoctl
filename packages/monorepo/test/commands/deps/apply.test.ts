import { link, readFile, symlink, writeFile } from 'node:fs/promises'
import { applyDependencyFixPlan, planDependencyFix } from '@icebreakers/monorepo'
import path from 'pathe'
import { describe, expect, it } from 'vitest'
import { fixture, policy, runCli, snapshot, writeJson } from './fixture'

const selection = { dependency: 'dep', section: 'devDependencies' as const, to: '^1.2.0' }
async function editableFixture() {
  return fixture({
    'packages/a': { devDependencies: { dep: '^1.0.0', keep: 'workspace:*' }, peerDependencies: { dep: '^1 || ^2' }, scripts: { build: 'echo keep' } },
    'packages/b': { devDependencies: { dep: '~1.2.0' } },
    'packages/untouched': { dependencies: { dep: '^3.0.0' } },
  })
}

describe('built dependency fix plans', () => {
  it('previews from a nested directory without writes, applies only the selected fields, and is idempotent', async () => {
    const h = await editableFixture()
    const before = await snapshot(h.root)
    const args = ['plan', 'dep', '--section', 'devDependencies', '--to', '^1.2.0', '--dry-run', '--json']
    const preview = runCli(h, args, path.join(h.workspace, 'packages/a'))
    expect(preview.status, preview.stderr).toBe(0)
    const plan = JSON.parse(preview.stdout)
    expect(plan.files.map((file: { path: string }) => file.path)).toEqual(['packages/a/package.json', 'packages/b/package.json'])
    expect(await planDependencyFix(h.workspace, selection)).toEqual(plan)
    expect(await snapshot(h.root)).toEqual(before)
    const planPath = path.join(h.root, 'plan.json')
    await writeJson(planPath, plan)
    const applied = runCli(h, ['apply', planPath, '--json'])
    expect(applied.status, applied.stderr).toBe(0)
    expect(JSON.parse(applied.stdout)).toMatchObject({ status: 'applied', changed: ['packages/a/package.json', 'packages/b/package.json'] })
    const manifest = JSON.parse(await readFile(path.join(h.workspace, 'packages/a/package.json'), 'utf8'))
    expect(manifest).toMatchObject({ devDependencies: { dep: '^1.2.0', keep: 'workspace:*' }, peerDependencies: { dep: '^1 || ^2' }, scripts: { build: 'echo keep' } })
    const after = await snapshot(h.root)
    for (const [file, content] of Object.entries(before)) {
      if (!['workspace/packages/a/package.json', 'workspace/packages/b/package.json'].includes(file)) {
        expect(after[file]).toBe(content)
      }
    }
    expect(await applyDependencyFixPlan(h.workspace, plan)).toMatchObject({ status: 'unchanged', changed: [] })
    expect(await snapshot(h.root)).toEqual(after)
    expect((await planDependencyFix(h.workspace, selection)).files).toEqual([])
  })

  it.each(['manifest', 'workspace', 'new-package', 'policy'])('rejects a stale %s input before any write', async (kind) => {
    const h = await editableFixture()
    const plan = await planDependencyFix(h.workspace, selection)
    if (kind === 'manifest') {
      await writeJson(path.join(h.workspace, 'packages/b/package.json'), { name: 'b', devDependencies: { dep: '^1.8.0' }, unrelated: true })
    }
    else if (kind === 'workspace') {
      await writeFile(path.join(h.workspace, 'pnpm-workspace.yaml'), 'packages: [packages/*]\n# concurrent edit\n')
    }
    else if (kind === 'policy') {
      await policy(h.workspace, [{ name: 'protected', workspaces: ['packages/b'], dependencies: ['dep'], reason: 'Keep this package separate' }])
    }
    else {
      await writeJson(path.join(h.workspace, 'packages/new/package.json'), { name: 'new', devDependencies: { dep: '^2.0.0' } })
    }
    const before = await snapshot(h.root)
    await expect(applyDependencyFixPlan(h.workspace, plan)).rejects.toThrow()
    expect(await snapshot(h.root)).toEqual(before)
  })

  it('rejects modified plan targets and paths instead of trusting arbitrary JSON changes', async () => {
    const h = await editableFixture()
    const plan = await planDependencyFix(h.workspace, selection)
    const before = await snapshot(h.root)
    const changed = structuredClone(plan)
    changed.files[0]!.after = '^9.0.0'
    await expect(applyDependencyFixPlan(h.workspace, changed)).rejects.toThrow('no longer match')
    const escaped = structuredClone(plan)
    escaped.files[0]!.path = '../package.json'
    await expect(applyDependencyFixPlan(h.workspace, escaped)).rejects.toThrow('undiscovered')
    expect(await snapshot(h.root)).toEqual(before)
  })

  it('honors the root policy from a nested directory', async () => {
    const h = await editableFixture()
    await policy(h.workspace, [{ name: 'keep', workspaces: ['packages/b'], dependencies: ['dep'], reason: 'Isolated compatibility target', ignore: true }])
    const result = runCli(h, ['plan', 'dep', '--section', 'devDependencies', '--to', '^1.2.0', '--json'], path.join(h.workspace, 'packages/a'))
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout).files.map((file: { path: string }) => file.path)).toEqual(['packages/a/package.json'])
  })

  it.each(['symbolic', 'hard'])('rejects %s linked manifest files before applying', async (kind) => {
    const h = await editableFixture()
    const target = path.join(h.workspace, 'packages/a/package.json')
    const outside = path.join(h.root, 'linked.json')
    if (kind === 'hard') {
      await link(target, outside)
    }
    else {
      const { rename } = await import('node:fs/promises')
      await rename(target, outside)
      await symlink(outside, target)
    }
    const before = await snapshot(h.root)
    await expect(planDependencyFix(h.workspace, selection)).rejects.toThrow('Linked')
    expect(await snapshot(h.root)).toEqual(before)
  })

  it('does not silently select incompatible targets or reconcile mutually exclusive major versions', async () => {
    const h = await editableFixture()
    const before = await snapshot(h.root)
    await expect(planDependencyFix(h.workspace, { ...selection, to: '^2.0.0' })).rejects.toThrow('incompatible upgrades')
    const other = await fixture({ 'packages/a': { dependencies: { dep: '^1' } }, 'packages/b': { dependencies: { dep: '^2' } } })
    await expect(planDependencyFix(other.workspace, { dependency: 'dep', section: 'dependencies', to: '^2' })).rejects.toThrow('conflict')
    expect(await snapshot(h.root)).toEqual(before)
  })
})
