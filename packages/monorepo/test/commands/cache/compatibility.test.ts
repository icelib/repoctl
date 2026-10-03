import { writeFile } from 'node:fs/promises'
import { analyzeTurboRuns } from '@icebreakers/monorepo'
import { describe, expect, it } from 'vitest'
import { cli, fixture } from './fixture'

describe('Turbo evidence compatibility and disclosure boundaries', () => {
  it('makes unknown schema and incomplete task identities explicit', async () => {
    const { data, save } = await fixture()
    const previous = await save('previous.json', data)
    data.version = 'future'
    const future = await analyzeTurboRuns(await save('future.json', data), { previous })
    expect(future.current.supportedSchema).toBe(false)
    expect(future.tasks.every(task => task.comparison === 'unknown' && !task.evidence.length)).toBe(true)
    expect(future.criticalPath.reason).toBe('unsupported-schema')
    data.version = '1'
    data.tasks.push(structuredClone(data.tasks[0]), { task: 'anonymous' })
    const ambiguous = await analyzeTurboRuns(await save('ambiguous.json', data), { previous })
    expect(ambiguous.tasks.find(task => task.taskId === 'a#build')?.comparison).toBe('unknown')
    expect(ambiguous.limitations.map(item => item.code)).toEqual(expect.arrayContaining(['duplicate_task_identity', 'missing_task_identity']))
    expect(ambiguous.criticalPath.reason).toBe('ambiguous-tasks')
    delete data.tasks
    const empty = await analyzeTurboRuns(await save('missing.json', data), { previous })
    expect(empty.tasks.every(task => task.comparison === 'unknown')).toBe(true)
    expect(empty.totals.hitRate).toBeNull()
  })

  it.each(['missing-timing', 'missing-dependencies', 'dependency-cycle', 'overlapping-dependency'])('declines a critical path with %s', async (reason) => {
    const { data, save } = await fixture()
    if (reason === 'missing-timing') {
      delete data.tasks[1].execution
    }
    if (reason === 'missing-dependencies') {
      delete data.tasks[1].dependencies
    }
    if (reason === 'dependency-cycle') {
      data.tasks[0].dependencies = ['b#build']
    }
    if (reason === 'overlapping-dependency') {
      data.tasks[1].execution.startTime = data.tasks[0].execution.startTime
    }
    expect((await analyzeTurboRuns(await save('run.json', data))).criticalPath).toMatchObject({ available: false, reason })
  })

  it('never discloses command arguments, arbitrary hash values, environment values or parser error excerpts', async () => {
    const { data, save, root } = await fixture()
    const previous = await save('previous.json', data)
    const secret = 'CREDENTIAL_SENTINEL'
    data.tasks[0].hash = secret
    data.tasks[0].inputs['package.json'] = secret
    data.tasks[0].command = `publish --token=${secret}`
    data.tasks[0].cliArguments = [secret]
    data.tasks[0].resolvedTaskDefinition.outputs = [secret]
    data.tasks[0].environmentVariables.configured = [`TOKEN=${secret}`]
    data.globalCacheInputs.hashOfExternalDependencies = secret
    const current = await save('current.json', data)
    for (const output of [JSON.stringify(await analyzeTurboRuns(current, { previous })), cli(root, ['cache', current, previous, '--markdown'])]) {
      expect(output).not.toContain(secret)
      expect(output).toContain('TOKEN')
    }
    await writeFile(current, `{"secret": "${secret}`)
    await expect(analyzeTurboRuns(current)).rejects.toThrow(/input contents are omitted/u)
    try {
      await analyzeTurboRuns(current)
    }
    catch (error) {
      expect(String(error)).not.toContain(secret)
    }
  })

  it('rejects dangerous control characters and escapes Markdown labels', async () => {
    const { data, save, root } = await fixture()
    data.tasks[0].taskId = '<script>#[link](https://bad.example)'
    data.tasks[1].dependencies = []
    const current = await save('current.json', data)
    const markdown = cli(root, ['cache', current, '--markdown'])
    expect(markdown).not.toContain('<script>')
    expect(markdown).not.toContain('[link](https://bad.example)')
    data.tasks[0].taskId = 'line\nFORGED'
    const invalid = await analyzeTurboRuns(await save('invalid.json', data))
    expect(invalid.limitations.some(item => item.code === 'missing_task_identity')).toBe(true)
    expect(JSON.stringify(invalid)).not.toContain('FORGED')
  })

  it('bounds nested evidence and input sizes with sanitized errors', async () => {
    const { data, save } = await fixture()
    let value: unknown = 'deep'
    for (let depth = 0; depth < 70; depth++) {
      value = { nested: value }
    }
    data.tasks[0].resolvedTaskDefinition.outputs = value
    await expect(analyzeTurboRuns(await save('nested.json', data))).rejects.toThrow(/nesting depth/u)
    const big = await save('big.json', {})
    await writeFile(big, ' '.repeat(20 * 1024 * 1024 + 1))
    await expect(analyzeTurboRuns(big)).rejects.toThrow(/at most 20 MiB/u)
  })
})
