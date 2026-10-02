import { rm } from 'node:fs/promises'
import { resolveAffectedCheckMatrix } from 'repoctl'
import { afterEach, describe, expect, it } from 'vitest'
import { addPackage, commit, fixture, write } from '../affected/fixture'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('matrix platform bounds', () => {
  it.each([0, -1, 1.5, 257, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid shard count %s', async (shards) => {
    await expect(resolveAffectedCheckMatrix({ cwd: '.', shards })).rejects.toThrow('integer from 1 to 256')
  })

  it('fails above 256 jobs and deterministically retains every package when sharded', async () => {
    const { root, cwd } = await fixture()
    roots.push(root)
    const ids = Array.from({ length: 257 }, (_, index) => `packages/job-${String(index).padStart(3, '0')}`)
    await Promise.all(ids.map((id, index) => addPackage(cwd, id, `@fixture/job-${index}`, {}, ['build'])))
    const base = commit(cwd)
    await Promise.all(ids.map(id => write(cwd, `${id}/src/index.ts`)))
    await expect(resolveAffectedCheckMatrix({ cwd, base })).rejects.toThrow('Use --shards 256')
    const result = await resolveAffectedCheckMatrix({ cwd, base, shards: 256 })
    expect(result.summary).toEqual({ selectedPackages: 257, jobs: 256, skippedPackages: [] })
    expect(result.matrix.include.flatMap(job => job.packages).sort()).toEqual(ids)
    expect(result.matrix.include[0]?.packages).toEqual([ids[0], ids[256]])
    expect((await resolveAffectedCheckMatrix({ cwd, base, shards: 1 })).matrix.include).toHaveLength(1)
  })

  it('reports the Actions output-size bound without truncating dependency builds', async () => {
    const { root, cwd } = await fixture()
    roots.push(root)
    const ids = Array.from({ length: 160 }, (_, index) => `packages/long-dependency-chain-${String(index).padStart(3, '0')}`)
    await Promise.all(ids.map((id, index) => addPackage(cwd, id, `@fixture/chain-${index}`, index ? { [`@fixture/chain-${index - 1}`]: 'workspace:*' } : {}, ['build'])))
    const base = commit(cwd)
    await write(cwd, `${ids[0]}/src/index.ts`)
    await expect(resolveAffectedCheckMatrix({ cwd, base })).rejects.toThrow('1 MB job output limit')
    const result = await resolveAffectedCheckMatrix({ cwd, base, shards: 1 })
    expect(result.summary.selectedPackages).toBe(160)
    expect(result.matrix.include[0]?.commands[0]?.targets).toEqual(ids)
  })
})
