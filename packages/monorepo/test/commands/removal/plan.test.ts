import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import path from 'pathe'
import { describe, expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist -- Verify the shipped public API.
import { applyWorkspaceRemovalPlan, planWorkspaceRemoval } from '../../../dist/index.mjs'
import { commit, fixture, git, snapshot, writeJson } from './fixture'

describe('workspace removal plans from built exports', () => {
  it('previews a precise target without writes and includes ignored files', async () => {
    const h = await fixture({ 'packages/old': { name: '@scope/old' }, 'packages/keep': {} })
    await mkdir(path.join(h.workspace, 'packages/old/ignored'))
    await writeFile(path.join(h.workspace, 'packages/old/ignored/cache'), 'generated')
    const before = await snapshot(h.root)
    const plan = await planWorkspaceRemoval(path.join(h.workspace, 'packages/keep'), { target: '@scope/old' })
    expect(plan.canApply).toBe(true)
    expect(plan.target.id).toBe('packages/old')
    expect(plan.inventory).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'ignored/cache', kind: 'file' })]))
    expect(plan.review.scope).toBe('git-tracked-text-literal-matches')
    expect(plan.review.scanned).toContain('docs/guide.md')
    expect(await snapshot(h.root)).toEqual(before)
  })

  it('shows root, private, direct and transitive consumers and removes only exact dependency fields', async () => {
    const h = await fixture({
      '.': { dependencies: { old: 'workspace:*', keep: 'workspace:*' }, dependenciesMeta: { old: { injected: true }, keep: { injected: true } } },
      'packages/old': { version: '1.0.0' },
      'packages/keep': { dependencies: { alias: 'workspace:old@*', unrelated: '^9' }, peerDependencies: { old: '^1' }, peerDependenciesMeta: { old: { optional: true }, unrelated: { optional: true } } },
      'packages/transitive': { devDependencies: { keep: 'workspace:*' } },
    })
    await writeFile(path.join(h.workspace, 'docs/guide.md'), 'import old from "old"\npackages/old is configured here\n')
    await commit(h.workspace)
    const blocked = await planWorkspaceRemoval(h.workspace, { target: 'old' })
    expect(blocked.canApply).toBe(false)
    expect(blocked.blockers).toContainEqual({ code: 'consumers', paths: expect.arrayContaining(['.', 'packages/keep', 'packages/transitive']) })
    expect(blocked.consumers).toContainEqual({ id: 'packages/transitive', direct: false, distance: 2, path: ['packages/transitive', 'packages/keep', 'packages/old'] })
    const plan = await planWorkspaceRemoval(h.workspace, { target: 'old', removeReferences: true })
    expect(plan.canApply).toBe(true)
    expect(plan.files.map(file => file.path)).toEqual(['package.json', 'packages/keep/package.json'])
    expect(JSON.parse(plan.files[1]!.after)).toMatchObject({ dependencies: { unrelated: '^9' }, peerDependencies: {}, peerDependenciesMeta: { unrelated: { optional: true } } })
    expect(JSON.parse(plan.files[0]!.after).dependenciesMeta).toEqual({ keep: { injected: true } })
    expect(plan.review.matches).toContainEqual({ path: 'docs/guide.md', values: ['packages/old', 'old'] })
  })

  it.each(['unstaged', 'staged', 'untracked'])('blocks a %s selected directory', async (mode) => {
    const h = await fixture()
    await writeFile(path.join(h.workspace, 'packages/old', mode === 'untracked' ? 'new.ts' : 'index.js'), 'changed')
    if (mode === 'staged') {
      await git(h.workspace, ['add', '--all'])
    }
    const plan = await planWorkspaceRemoval(h.workspace, { target: 'old' })
    expect(plan.blockers).toContainEqual({ code: 'dirty_target', paths: ['packages/old'] })
    await expect(applyWorkspaceRemovalPlan(h.workspace, plan)).rejects.toThrow('blocked')
  })

  it('blocks a workspace without Git and an embedded repository', async () => {
    const h = await fixture(undefined, { git: false })
    expect((await planWorkspaceRemoval(h.workspace, { target: 'old' })).blockers).toContainEqual({ code: 'git_unavailable', paths: ['packages/old'] })
    await git(h.workspace, ['init'])
    await commit(h.workspace)
    await mkdir(path.join(h.workspace, 'packages/old/.git'))
    const plan = await planWorkspaceRemoval(h.workspace, { target: 'old' })
    expect(plan.blockers.some(item => item.code === 'nested_repository')).toBe(true)
  })

  it('rejects root, outside, unknown, ambiguous and unselected nested workspace targets', async () => {
    const h = await fixture({ 'packages/old': {}, 'packages/duplicate': { name: 'old' } })
    for (const target of ['.', './', '../outside', './missing', 'old']) {
      await expect(planWorkspaceRemoval(h.workspace, { target })).rejects.toThrow()
    }
    await writeFile(path.join(h.workspace, 'pnpm-workspace.yaml'), 'packages: [packages/**]\n')
    await writeJson(path.join(h.workspace, 'packages/old/nested/package.json'), { name: 'nested' })
    await expect(planWorkspaceRemoval(h.workspace, { target: './packages/old' })).rejects.toThrow('unselected workspace')
  })

  it('blocks uncertain catalog references even when the manifest key hides the target', async () => {
    const h = await fixture({ 'packages/old': { version: '1.0.0' }, 'packages/keep': { dependencies: { alias: 'catalog:unknown' } } })
    const plan = await planWorkspaceRemoval(h.workspace, { target: 'old', removeReferences: true })
    expect(plan.blockers.some(item => item.code === 'graph_incomplete')).toBe(true)
  })

  it('blocks unsupported YAML manifests without rewriting them', async () => {
    const h = await fixture({ 'packages/old': {}, 'packages/keep': {} })
    await rm(path.join(h.workspace, 'packages/keep/package.json'))
    await writeFile(path.join(h.workspace, 'packages/keep/package.yaml'), 'name: keep\nprivate: true\n')
    await commit(h.workspace)
    const plan = await planWorkspaceRemoval(h.workspace, { target: 'old' })
    expect(plan.blockers).toContainEqual({ code: 'unsupported_manifest', paths: ['packages/keep/package.yaml'] })
    expect(await readFile(path.join(h.workspace, 'packages/keep/package.yaml'), 'utf8')).toBe('name: keep\nprivate: true\n')
  })

  it('blocks unresolved local references into files inside the selected package', async () => {
    const h = await fixture({ 'packages/old': {}, 'packages/keep': { dependencies: { archive: 'file:../old/release.tgz' } } })
    const plan = await planWorkspaceRemoval(h.workspace, { target: 'old', removeReferences: true })
    expect(plan.blockers).toContainEqual({ code: 'graph_incomplete', paths: ['packages/keep'] })
    expect(plan.diagnostics).toContainEqual(expect.objectContaining({ dependency: 'archive', specifier: 'file:../old/release.tgz' }))
  })

  it('rejects a linked selected directory while preserving its destination', async () => {
    const h = await fixture({ 'packages/old': {}, 'packages/keep': {} })
    await rm(path.join(h.workspace, 'packages/old'), { recursive: true })
    await symlink(path.join(h.workspace, 'packages/keep'), path.join(h.workspace, 'packages/old'), 'junction')
    await expect(planWorkspaceRemoval(h.workspace, { target: './packages/old' })).rejects.toThrow()
    expect(await readFile(path.join(h.workspace, 'packages/keep/index.js'), 'utf8')).toContain('42')
  })
})
