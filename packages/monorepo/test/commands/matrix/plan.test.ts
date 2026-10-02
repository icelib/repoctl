import { rm } from 'node:fs/promises'
import { resolveAffectedCheckPlan } from '@icebreakers/monorepo'
import { resolveAffectedCheckMatrix } from 'repoctl'
import { afterEach, describe, expect, it } from 'vitest'
import { addPackage, commit, fixture, git, write } from '../affected/fixture'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
async function setup(...args: Parameters<typeof fixture>) {
  const result = await fixture(...args)
  roots.push(result.root)
  return result
}

describe('built affected CI matrix', () => {
  it('returns an empty, serializable matrix for no changes or an empty filter intersection', async () => {
    const { cwd, base } = await setup()
    const empty = await resolveAffectedCheckMatrix({ cwd, base })
    expect(empty).toMatchObject({ schemaVersion: 1, provider: 'github-actions', hasWork: false, summary: { selectedPackages: 0, jobs: 0 }, matrix: { include: [] } })
    expect(JSON.parse(JSON.stringify(empty.matrix))).toEqual({ include: [] })
    await write(cwd, 'packages/base/src/index.ts')
    expect((await resolveAffectedCheckMatrix({ cwd, base, filters: ['@fixture/isolated'] })).hasWork).toBe(false)
  })

  it('keeps the exact affected plan and assigns consumers their own prerequisite builds', async () => {
    const { cwd, base } = await setup()
    await write(cwd, 'packages/base/src/index.ts')
    const before = git(cwd, 'status', '--porcelain')
    const result = await resolveAffectedCheckMatrix({ cwd, base })
    expect(result.affectedPlan).toEqual(await resolveAffectedCheckPlan({ cwd, base }))
    expect(result.matrix.include.map(job => job.packages)).toEqual([['apps/web'], ['packages/base'], ['packages/shared']])
    expect(result.matrix.include[0]?.commands[0]).toMatchObject({ name: 'build', targets: ['apps/web', 'packages/base', 'packages/shared'], prerequisiteTargets: ['packages/base', 'packages/shared'] })
    for (const command of result.affectedPlan.commands) {
      const actual = [...new Set(result.matrix.include.flatMap(job => job.commands.find(item => item.name === command.name)!.targets))].sort()
      expect(actual).toEqual(command.targets)
    }
    expect(result.summary).toEqual({ selectedPackages: 3, jobs: 3, skippedPackages: [] })
    expect(git(cwd, 'status', '--porcelain')).toBe(before)
    expect(await resolveAffectedCheckMatrix({ cwd, base })).toEqual(result)
  })

  it('groups sorted packages deterministically without splitting stages across jobs', async () => {
    const { cwd, base } = await setup()
    await write(cwd, 'packages/base/src/index.ts')
    const result = await resolveAffectedCheckMatrix({ cwd, base, shards: 2 })
    expect(result.grouping).toBe('shard')
    expect(result.matrix.include.map(job => job.packages)).toEqual([['apps/web', 'packages/shared'], ['packages/base']])
    expect(result.matrix.include.every(job => job.commands.map(command => command.name).join(',') === 'build,lint,typecheck,tsd,test')).toBe(true)
    const single = await resolveAffectedCheckMatrix({ cwd, base, filters: ['@fixture/web'], shards: 8 })
    expect(single.matrix.include).toHaveLength(1)
    expect(single.matrix.include[0]?.packages).toEqual(['apps/web'])
  })

  it.each([true, false])('keeps full fallback together with root scripts=%s and preserves Git diagnostics', async (rootScripts) => {
    const { cwd, base } = await setup({ rootScripts })
    await write(cwd, '.npmrc', 'strict-peer-dependencies=false')
    const result = await resolveAffectedCheckMatrix({ cwd, base, shards: 4 })
    expect(result.grouping).toBe('full')
    expect(result.matrix.include).toHaveLength(1)
    expect(result.matrix.include[0]?.commands).toEqual(result.affectedPlan.commands)
    expect(result.affectedPlan.fallback).toContainEqual({ code: 'global_input', files: ['.npmrc'] })
    const missing = await resolveAffectedCheckMatrix({ cwd, base: 'missing-ref', shards: 4 })
    expect(missing.hasWork).toBe(true)
    expect(missing.grouping).toBe('full')
    expect(missing.affectedPlan.fallback).toContainEqual({ code: 'base_unavailable' })
  })

  it('keeps missing-script reasons and omits groups that have no runnable command', async () => {
    const { cwd } = await setup()
    await addPackage(cwd, 'packages/empty', '@fixture/empty', {}, [])
    const base = commit(cwd)
    await write(cwd, 'packages/empty/src/index.ts')
    const result = await resolveAffectedCheckMatrix({ cwd, base })
    expect(result.hasWork).toBe(false)
    expect(result.summary).toEqual({ selectedPackages: 1, jobs: 0, skippedPackages: ['packages/empty'] })
    expect(result.affectedPlan.commands.every(command => command.skipReason === 'missing_script')).toBe(true)
  })
})
