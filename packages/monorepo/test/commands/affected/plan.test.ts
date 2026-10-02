import { rm } from 'node:fs/promises'
import process from 'node:process'
import { resolveAffectedCheckPlan } from '@icebreakers/monorepo'
import { afterEach, describe, expect, it } from 'vitest'
import { addPackage, commit, fixture, git, write } from './fixture'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
async function setup(...args: Parameters<typeof fixture>) {
  const result = await fixture(...args)
  roots.push(result.root)
  return result
}

describe('built affected check plans', () => {
  it('explains changed packages and every transitive consumer, then plans build before checks', async () => {
    const { cwd, base } = await setup()
    await write(cwd, 'packages/base/src/index.ts')
    commit(cwd)
    const plan = await resolveAffectedCheckPlan({ cwd, base })
    expect(plan.strategy).toBe('affected')
    expect(plan.packages.filter(pkg => pkg.selected).map(pkg => pkg.id)).toEqual(['apps/web', 'packages/base', 'packages/shared'])
    expect(plan.packages.find(pkg => pkg.id === 'apps/web')?.reasons).toContainEqual({ code: 'dependent', path: ['apps/web', 'packages/shared', 'packages/base'] })
    expect(plan.files[0]).toMatchObject({ path: 'packages/base/src/index.ts', owner: 'packages/base' })
    expect(plan.commands.map(command => command.name)).toEqual(['build', 'lint', 'typecheck', 'tsd', 'test'])
    expect(await resolveAffectedCheckPlan({ cwd, base })).toEqual(plan)
  })

  it('includes staged, unstaged, untracked, deleted and both sides of renamed files', async () => {
    const { cwd, base } = await setup()
    git(cwd, 'mv', 'packages/base/src/index.ts', 'apps/isolated/src/moved.ts')
    const filename = process.platform === 'win32' ? '新 file.ts' : '新 file\nline.ts'
    await write(cwd, `packages/shared/src/${filename}`)
    await write(cwd, 'apps/web/src/index.ts')
    const plan = await resolveAffectedCheckPlan({ cwd, base })
    expect(plan.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'packages/base/src/index.ts', kinds: ['deleted'], owner: 'packages/base' }),
      expect.objectContaining({ path: 'apps/isolated/src/moved.ts', kinds: ['added'], owner: 'apps/isolated' }),
      expect.objectContaining({ path: `packages/shared/src/${filename}`, kinds: ['untracked'] }),
      expect.objectContaining({ path: 'apps/web/src/index.ts', kinds: ['modified'] }),
    ]))
    expect(plan.packages.every(pkg => pkg.selected)).toBe(true)
  })

  it('retains staged changes when unstaged edits restore the committed file contents', async () => {
    const { cwd, base } = await setup()
    const file = 'packages/base/src/index.ts'
    await write(cwd, file, 'staged change')
    git(cwd, 'add', file)
    await write(cwd, file, 'export const value = 1\n')
    expect(git(cwd, 'diff', 'HEAD', '--name-only')).toBe('')
    const plan = await resolveAffectedCheckPlan({ cwd, base })
    expect(plan.files).toContainEqual({ path: file, kinds: ['modified'], owner: 'packages/base' })
    expect(plan.packages.filter(pkg => pkg.selected).map(pkg => pkg.id)).toEqual(['apps/web', 'packages/base', 'packages/shared'])
  })

  it.each(['deleted', 'new'])('falls back for a %s package manifest', async (kind) => {
    const { cwd, base } = await setup()
    if (kind === 'deleted') {
      await rm(`${cwd}/packages/shared`, { recursive: true })
    }
    else {
      await addPackage(cwd, 'packages/new', '@fixture/new')
    }
    const plan = await resolveAffectedCheckPlan({ cwd, base })
    expect(plan.strategy).toBe('full')
    expect(plan.fallback.map(reason => reason.code)).toContain('workspace_manifest_changed')
    expect(plan.packages.every(pkg => pkg.selected)).toBe(true)
  })

  it('honors root/global inputs while explaining documentation-only and no-change skips', async () => {
    const { cwd, base } = await setup({ globalInput: 'docs/policy.md' })
    const empty = await resolveAffectedCheckPlan({ cwd, base })
    expect(empty.commands.every(command => command.skipReason === 'no_affected_packages')).toBe(true)
    await write(cwd, 'README.md')
    const docs = await resolveAffectedCheckPlan({ cwd, base })
    expect(docs.files[0]?.reason).toBe('documentation')
    expect(docs.packages.every(pkg => !pkg.selected)).toBe(true)
    await write(cwd, 'docs/policy.md')
    const global = await resolveAffectedCheckPlan({ cwd, base })
    expect(global.fallback).toContainEqual({ code: 'global_input', files: ['docs/policy.md'] })
    expect(global.packages.every(pkg => pkg.selected)).toBe(true)
    const additional = await resolveAffectedCheckPlan({ cwd, base, globalInputs: ['README.md'] })
    expect(additional.files.find(file => file.path === 'README.md')?.reason).toBe('global_input')
  })

  it('intersects explicit filters, records missing scripts and builds dependencies outside the check filter', async () => {
    const { cwd, base } = await setup()
    await write(cwd, 'packages/base/src/index.ts')
    const plan = await resolveAffectedCheckPlan({ cwd, base, filters: ['@fixture/web'] })
    expect(plan.packages.filter(pkg => pkg.selected).map(pkg => pkg.id)).toEqual(['apps/web'])
    expect(plan.commands[0]?.prerequisiteTargets).toEqual(['packages/base', 'packages/shared'])
    expect(plan.commands.at(-1)?.targets).toEqual(['apps/web'])
    const empty = await resolveAffectedCheckPlan({ cwd, base, filters: ['@fixture/isolated'] })
    expect(empty.commands.every(command => command.skipReason === 'filter_intersection_empty')).toBe(true)
    await write(cwd, 'apps/isolated/src/index.ts')
    const missing = await resolveAffectedCheckPlan({ cwd, base, filters: ['@fixture/isolated'] })
    expect(missing.commands.find(command => command.name === 'lint')).toMatchObject({ skipReason: 'missing_script', missingTargets: ['apps/isolated'] })
  })
})
