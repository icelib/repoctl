import { readdir, readFile } from 'node:fs/promises'
import { analyzeTurboRuns } from '@icebreakers/monorepo'
import { describe, expect, it } from 'vitest'
import { fixture } from './fixture'

describe('built Turbo run summary analysis', () => {
  it('reads a real Turbo 2.11.6 summary and computes measured task time separately from span', async () => {
    const { data, save, root } = await fixture()
    const current = await save('current.json', data)
    const before = await readFile(current)
    const result = await analyzeTurboRuns(current)
    expect(result.totals).toEqual({ tasks: 2, hits: 0, misses: 2, unknownCache: 0, hitRate: 0 })
    expect(result.slowest).toEqual([{ taskId: 'a#build', durationMs: 319 }, { taskId: 'b#build', durationMs: 312 }])
    expect(result.criticalPath).toEqual({ available: true, reason: 'complete', taskIds: ['a#build', 'b#build'], durationMs: 631, observedSpanMs: 632 })
    expect(result.limitations).toEqual([])
    expect(result.tasks.every(task => task.comparison === 'not-requested')).toBe(true)
    expect(await readFile(current)).toEqual(before)
    expect(await readdir(root)).toEqual(['current.json'])
  })

  it('compares stable task IDs and explains inputs, global files, dependency hashes and environment/configuration changes', async () => {
    const { data, save } = await fixture()
    const previous = await save('previous.json', data)
    data.tasks[0].hash = 'new-a'
    data.tasks[0].inputs['src/index.ts'] = 'new-file'
    data.tasks[0].hashOfExternalDependencies = 'new-deps'
    data.tasks[1].hash = 'new-b'
    data.tasks[1].cache.status = 'HIT'
    data.tasks[1].resolvedTaskDefinition.outputs = ['dist/**']
    data.tasks[1].environmentVariables.specified.env = ['PUBLIC_API']
    data.tasks[1].environmentVariables.configured = ['PUBLIC_API=secret-url']
    data.globalCacheInputs.files['tsconfig.json'] = 'global-change'
    data.tasks.reverse()
    const result = await analyzeTurboRuns(await save('current.json', data), { previous })
    expect(result.tasks.map(task => task.taskId)).toEqual(['a#build', 'b#build'])
    expect(result.tasks.every(task => task.comparison === 'changed')).toBe(true)
    expect(result.tasks[0]!.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'input', field: 'inputs.src/index.ts', change: 'added' }),
      expect.objectContaining({ category: 'configuration', field: 'task.hashOfExternalDependencies', change: 'changed' }),
    ]))
    expect(result.tasks[1]!.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'dependency', field: 'dependencies.hash.a#build', change: 'changed' }),
      expect.objectContaining({ category: 'environment', field: 'environment.configured.PUBLIC_API', change: 'added' }),
      expect.objectContaining({ category: 'configuration', field: 'definition.outputs', change: 'changed' }),
    ]))
    expect(result.globalEvidence).toContainEqual(expect.objectContaining({ category: 'global-input', field: 'global.files.tsconfig.json', change: 'added' }))
    expect(result.totals.hitRate).toBe(0.5)
    expect(JSON.stringify(result)).not.toContain('secret-url')
  })

  it('reports unchanged hashes with cache misses, opaque changes and added/removed tasks without inventing causes', async () => {
    const { data, save } = await fixture()
    const previous = await save('previous.json', data)
    const same = await analyzeTurboRuns(previous, { previous })
    expect(same.tasks.every(task => task.comparison === 'unchanged' && !task.evidence.length)).toBe(true)
    expect(same.limitations.filter(item => item.code === 'cache_miss_with_unchanged_hash')).toHaveLength(2)
    data.tasks[0].hash = 'opaque'
    const opaque = await analyzeTurboRuns(await save('opaque.json', data), { previous })
    expect(opaque.limitations).toContainEqual({ code: 'hash_changed_without_explanation', summary: 'current', taskId: 'a#build' })
    data.tasks[0].taskId = 'new#build'
    const result = await analyzeTurboRuns(await save('current.json', data), { previous })
    expect(result.tasks.find(task => task.taskId === 'new#build')?.comparison).toBe('added')
    expect(result.tasks.find(task => task.taskId === 'a#build')?.comparison).toBe('removed')
    expect(result.criticalPath.reason).toBe('missing-dependencies')
  })

  it('does not call missing configuration evidence a removal or count unknown cache outcomes as misses', async () => {
    const { data, save } = await fixture()
    const previous = await save('previous.json', data)
    data.tasks[0].resolvedTaskDefinition = {}
    delete data.tasks[0].command
    delete data.tasks[0].cache
    delete data.globalCacheInputs.rootKey
    const result = await analyzeTurboRuns(await save('current.json', data), { previous })
    expect(result.tasks[0]!.evidence.filter(item => item.field.startsWith('definition.') || item.field === 'task.command' || item.field === 'global.rootKey').every(item => item.change === 'unknown')).toBe(true)
    expect(result.globalEvidence).toContainEqual(expect.objectContaining({ field: 'global.rootKey', change: 'unknown' }))
    expect(result.totals).toMatchObject({ misses: 1, unknownCache: 1, hitRate: 0 })
    expect(result.limitations).toContainEqual({ code: 'incomplete_hash_evidence', summary: 'current', taskId: 'a#build', field: 'configuration' })
  })

  it('retains usable changed evidence inside a partial map but marks absent entries unknown', async () => {
    const { data, save } = await fixture()
    data.tasks[0].inputs.old = 'old'
    const previous = await save('previous.json', data)
    data.tasks[0].inputs = { 'invalid': 123, 'package.json': 'changed' }
    const result = await analyzeTurboRuns(await save('current.json', data), { previous })
    expect(result.tasks[0]!.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'inputs.package.json', change: 'changed' }),
      expect.objectContaining({ field: 'inputs.old', change: 'unknown' }),
    ]))
  })
  it('chooses the longest branch in a dependency DAG rather than summing parallel tasks', async () => {
    const { data, save } = await fixture()
    const base = data.tasks[0]
    data.tasks = [
      { ...base, taskId: 'join#build', dependencies: ['short#build', 'long#build'], execution: { startTime: 100, endTime: 110 } },
      { ...base, taskId: 'short#build', dependencies: ['root#build'], execution: { startTime: 11, endTime: 21 } },
      { ...base, taskId: 'root#build', dependencies: [], execution: { startTime: 0, endTime: 10 } },
      { ...base, taskId: 'long#build', dependencies: ['root#build'], execution: { startTime: 11, endTime: 51 } },
    ]
    const report = await analyzeTurboRuns(await save('branches.json', data))
    expect(report.criticalPath).toMatchObject({ available: true, taskIds: ['root#build', 'long#build', 'join#build'], durationMs: 60, observedSpanMs: 110 })
  })
  it('stores global differences once regardless of workspace count', async () => {
    const { data, save } = await fixture()
    data.tasks = Array.from({ length: 100 }, (_, index) => ({ ...data.tasks[0], taskId: `pkg-${index}#build` }))
    const previous = await save('previous.json', data)
    data.globalCacheInputs.files = Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`global-${index}.json`, 'changed']))
    const report = await analyzeTurboRuns(await save('current.json', data), { previous })
    expect(report.globalEvidence).toHaveLength(101)
    expect(report.tasks.every(task => task.evidence.length === 0)).toBe(true)
  })

  it('treats null configured environment data as unavailable rather than empty', async () => {
    const { data, save } = await fixture()
    data.tasks[0].environmentVariables.configured = ['TOKEN=before']
    const previous = await save('previous.json', data)
    data.tasks[0].environmentVariables.configured = null
    const report = await analyzeTurboRuns(await save('current.json', data), { previous })
    expect(report.tasks[0]!.evidence).toContainEqual(expect.objectContaining({ field: 'environment.configured.TOKEN', change: 'unknown' }))
  })
})
