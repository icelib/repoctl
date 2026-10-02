import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveAffectedCheckPlan } from '@icebreakers/monorepo'
import { afterEach, describe, expect, it } from 'vitest'
import { commit, fixture, git, write } from './fixture'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
async function setup(...args: Parameters<typeof fixture>) {
  const result = await fixture(...args)
  roots.push(result.root)
  return result
}

describe('affected conservative fallbacks', () => {
  it('explains missing refs, a non-current head and unavailable Git without returning an empty plan', async () => {
    const { cwd, base } = await setup({ rootScripts: true })
    for (const [options, code] of [
      [{ base: 'not-a-real-ref' }, 'base_unavailable'],
      [{ base, head: 'not-a-real-ref' }, 'head_unavailable'],
    ] as const) {
      const plan = await resolveAffectedCheckPlan({ cwd, ...options })
      expect(plan.fallback.map(reason => reason.code)).toContain(code)
      expect(plan.packages.every(pkg => pkg.selected)).toBe(true)
      expect(plan.commands.every(command => command.scope === 'root' && command.targets[0] === '.')).toBe(true)
    }
    await write(cwd, 'packages/base/src/index.ts')
    commit(cwd)
    expect((await resolveAffectedCheckPlan({ cwd, base, head: base })).fallback).toContainEqual({ code: 'head_not_checked_out' })
    await rm(path.join(cwd, '.git'), { recursive: true })
    expect((await resolveAffectedCheckPlan({ cwd, base })).fallback).toContainEqual({ code: 'git_unavailable' })
  })

  it('falls back for a shallow clone missing the base and for unrelated history', async () => {
    const { root, cwd, base } = await setup()
    await write(cwd, 'packages/base/src/index.ts')
    commit(cwd)
    const shallow = path.join(root, 'shallow')
    git(root, 'clone', '--depth', '1', pathToFileURL(cwd).href, shallow)
    const plan = await resolveAffectedCheckPlan({ cwd: shallow, base })
    expect(plan.fallback).toContainEqual({ code: 'base_unavailable' })
    expect(plan.packages.every(pkg => pkg.selected)).toBe(true)
    git(cwd, 'checkout', '--orphan', 'unrelated')
    commit(cwd)
    expect((await resolveAffectedCheckPlan({ cwd, base })).fallback).toContainEqual({ code: 'merge_base_unavailable' })
  })

  it('retains unresolved graph diagnostics and unknown global inputs as full-fallback reasons', async () => {
    const { cwd } = await setup()
    const manifest = JSON.parse(await readFile(`${cwd}/packages/shared/package.json`, 'utf8'))
    manifest.dependencies['hidden-alias'] = 'catalog:'
    await write(cwd, 'packages/shared/package.json', JSON.stringify(manifest))
    const base = commit(cwd)
    await write(cwd, 'packages/base/src/index.ts')
    const graph = await resolveAffectedCheckPlan({ cwd, base })
    expect(graph.fallback).toContainEqual(expect.objectContaining({ code: 'graph_diagnostics', diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'unresolved_specifier' })]) }))
    await write(cwd, 'settings.txt')
    expect((await resolveAffectedCheckPlan({ cwd, base })).fallback).toContainEqual({ code: 'unowned_change', files: ['settings.txt'] })
    await write(cwd, 'turbo.json', '{ invalid')
    expect((await resolveAffectedCheckPlan({ cwd, base })).fallback).toContainEqual({ code: 'global_inputs_unavailable' })
  })

  it('fails discovery explicitly when it cannot establish a safe workspace', async () => {
    const { cwd, base } = await setup()
    await write(cwd, 'pnpm-workspace.yaml', 'packages: [unterminated')
    await expect(resolveAffectedCheckPlan({ cwd, base })).rejects.toThrow()
    await rm(`${cwd}/pnpm-workspace.yaml`)
    await expect(resolveAffectedCheckPlan({ cwd, base })).rejects.toThrow('Affected checks require a discoverable pnpm-workspace.yaml')
  })

  it('uses package scripts when a pnpm workspace has no root package manifest', async () => {
    const { cwd, base } = await setup()
    await rm(`${cwd}/package.json`)
    const plan = await resolveAffectedCheckPlan({ cwd, base })
    expect(plan.strategy).toBe('full')
    expect(plan.commands.every(command => command.scope === 'packages' && command.targets.length > 0)).toBe(true)
  })
})
