import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { expect, it, vi } from 'vitest'
import { verifyNightlyConsumer } from '../../../../../src/commands/release/nightly/consumer'
import { completed, consumerFixture, missingVersion } from './fixture'

it('retries only installation for missing batch tags and exact versions, retaining each attempt', async () => {
  const h = await consumerFixture()
  h.install.mockReturnValueOnce(completed(missingVersion('@scope/a@snapshot-nightly')))
    .mockReturnValueOnce(completed(missingVersion(`b@${h.report.packages[1]!.version}`)))
  await verifyNightlyConsumer(h.report, h.options)
  expect(h.report.consumer?.status).toBe('verified')
  expect(h.report.consumer?.commands.filter(command => command.args.includes('install')).map(command => command.exitCode)).toEqual([1, 1, 0])
  expect(h.sleep.mock.calls.map(([delay]) => delay)).toEqual([2_000, 4_000])
  expect(h.spawn.mock.calls.every(([executable, args]) => executable !== 'npm' && !args.includes('publish'))).toBe(true)
  expect(h.report.confirmed).toBe(true)
})

it('uses fresh consumer-owned pnpm state and discards partial installations before retrying', async () => {
  const h = await consumerFixture()
  const previous: string[] = []
  h.install.mockImplementationOnce((args, settings) => {
    const cwd = String(settings.cwd)
    for (const prefix of ['--store-dir=', '--state-dir=', '--config.cache-dir=']) {
      const directory = args.find(arg => arg.startsWith(prefix))!.slice(prefix.length)
      expect(path.relative(cwd, directory)).toMatch(/^\.pnpm-attempt-0[/\\]/u)
      mkdirSync(directory, { recursive: true })
      writeFileSync(path.join(directory, 'stale'), 'stale metadata')
      previous.push(directory)
    }
    mkdirSync(path.join(cwd, 'node_modules'), { recursive: true })
    writeFileSync(path.join(cwd, 'node_modules', 'partial'), '')
    writeFileSync(path.join(cwd, 'pnpm-lock.yaml'), 'partial lockfile')
    return completed(missingVersion('@scope/a@snapshot-nightly'))
  }).mockImplementationOnce((args, settings) => {
    const cwd = String(settings.cwd)
    expect(existsSync(path.join(cwd, 'node_modules'))).toBe(false)
    expect(existsSync(path.join(cwd, 'pnpm-lock.yaml'))).toBe(false)
    expect(previous.every(directory => !existsSync(directory))).toBe(true)
    for (const prefix of ['--store-dir=', '--state-dir=', '--config.cache-dir=']) {
      expect(args.find(arg => arg.startsWith(prefix))).toContain('.pnpm-attempt-1')
    }
    expect(args).toContain('--no-prefer-offline')
    expect(args).toContain('--no-prefer-frozen-lockfile')
    return undefined
  })
  await verifyNightlyConsumer(h.report, h.options)
  expect(h.install).toHaveBeenCalledTimes(2)
  expect(existsSync(h.installed())).toBe(false)
})

it.each(['aliased', '@scope/aliased'])('recognizes %s npm aliases only for exact batch targets', async (alias) => {
  const h = await consumerFixture()
  h.install.mockReturnValueOnce(completed(missingVersion(`${alias}@npm:@scope/a@${h.report.packages[0]!.version}`)))
  await verifyNightlyConsumer(h.report, h.options)
  expect(h.install).toHaveBeenCalledTimes(2)
  expect(h.report.consumer?.status).toBe('verified')
})

it('classifies complete NDJSON before truncating retained command diagnostics', async () => {
  const h = await consumerFixture()
  h.install.mockReturnValueOnce(completed([
    JSON.stringify({ name: 'pnpm:progress', level: 'debug', message: 'x'.repeat(10_000) }),
    missingVersion('@scope/a@snapshot-nightly'),
  ].join('\n')))
  await verifyNightlyConsumer(h.report, h.options)
  expect(h.install).toHaveBeenCalledTimes(2)
  expect(h.report.consumer?.commands[1]?.stderr).toHaveLength(4000)
})

it('bounds the full confirmation by elapsed installation time plus injected waits', async () => {
  const h = await consumerFixture()
  let now = 0
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => now)
  try {
    h.install.mockImplementation(() => {
      now += 3_000
      return completed(missingVersion('@scope/a@snapshot-nightly'))
    })
    await expect(verifyNightlyConsumer(h.report, h.options)).rejects.toThrow('visibility timed out')
    expect(h.install.mock.calls.map(([, settings]) => settings.timeout)).toEqual([10_000, 5_000])
    expect(h.sleep.mock.calls.map(([delay]) => delay)).toEqual([2_000, 2_000])
    expect(h.report.consumer?.commands.filter(command => command.args.includes('install'))).toHaveLength(2)
    expect(h.report.confirmed).toBe(true)
  }
  finally {
    clock.mockRestore()
  }
})

it('caps configurable visibility waits at fifteen minutes without unbounded fake-sleep loops', async () => {
  const h = await consumerFixture()
  h.options.config = { registry: { visibilityTimeoutMs: 3_600_000 } }
  const clock = vi.spyOn(performance, 'now').mockReturnValue(0)
  try {
    h.install.mockReturnValue(completed(missingVersion('@scope/a@snapshot-nightly')))
    await expect(verifyNightlyConsumer(h.report, h.options)).rejects.toThrow('visibility timed out')
    expect(h.sleep.mock.calls.reduce((total, [delay]) => total + delay, 0)).toBe(900_000)
    expect(h.install.mock.calls.length).toBeLessThan(40)
    expect(h.install.mock.calls.every(([, settings]) => Number(settings.timeout) > 0 && Number(settings.timeout) <= 600_000)).toBe(true)
  }
  finally {
    clock.mockRestore()
  }
})

it('never passes a zero process timeout when the deadline expires before spawning', async () => {
  const h = await consumerFixture()
  h.options.config = { registry: { visibilityTimeoutMs: 1 } }
  const clock = vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(1)
  try {
    await expect(verifyNightlyConsumer(h.report, h.options)).rejects.toThrow('visibility timed out')
    expect(h.install).not.toHaveBeenCalled()
  }
  finally {
    clock.mockRestore()
  }
})
