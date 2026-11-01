import type { NightlyOptions } from '@icebreakers/monorepo'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { nightlyCommand, nightlyQualityCommand } from '../../../../src/commands/release/nightly/process'
import { reportFixture } from './provider-fixture'

const deadlineVariable = 'REPOCTL_NIGHTLY_QUALITY_DEADLINE_EPOCH'
const now = 1_700_000_000_250
const epoch = 1_700_000_000
const maximumTimer = 2_147_483_647
const invalidDeadline = 'Nightly quality deadline must be a positive safe integer epoch timestamp.'
const exhaustedBudget = 'Nightly shared quality budget exhausted before starting a command.'

function commandFixture(env?: NodeJS.ProcessEnv) {
  const report = reportFixture()
  const spawn = vi.fn(() => ({
    status: 0 as number | null,
    signal: null as string | null,
    error: undefined as Error | undefined,
    stdout: '  quality passed\n',
    stderr: 'quality warning\n',
    pid: 1,
    output: [null, '  quality passed\n', 'quality warning\n'],
  }))
  const options: NightlyOptions = {
    cwd: import.meta.dirname,
    spawn: spawn as unknown as NonNullable<NightlyOptions['spawn']>,
    ...(env === undefined ? {} : { env }),
  }
  return { report, spawn, options }
}

beforeEach(() => {
  vi.stubEnv(deadlineVariable, undefined)
  vi.spyOn(Date, 'now').mockReturnValue(now)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

it.each([
  { label: 'default quality', timeout: undefined, expected: 2_700_000 },
  { label: 'explicit', timeout: 123_456, expected: 123_456 },
])('preserves the $label timeout without a shared deadline', ({ timeout, expected }) => {
  const { report, options, spawn } = commandFixture()
  nightlyQualityCommand(report, options, 'pnpm', ['run', 'quality'], timeout)
  expect(spawn).toHaveBeenCalledWith('pnpm', ['run', 'quality'], expect.objectContaining({ timeout: expected }))
})

it.each([undefined, 123_456])('uses the ambient shared budget instead of the command timeout %s', (timeout) => {
  vi.stubEnv(deadlineVariable, String(epoch + 3600))
  const { report, options, spawn } = commandFixture()
  expect(nightlyQualityCommand(report, options, 'pnpm', ['run', 'quality'], timeout)).toBe('quality passed')
  expect(spawn).toHaveBeenCalledWith('pnpm', ['run', 'quality'], expect.objectContaining({ timeout: 3_599_750 }))
  expect(report.commands).toEqual([expect.objectContaining({
    exitCode: 0,
    stdout: '  quality passed\n',
    stderr: 'quality warning\n',
    output: '  quality passed\n\nquality warning\n',
  })])
})

it('takes an explicit environment as the complete source of the deadline without mutating it', () => {
  vi.stubEnv(deadlineVariable, 'invalid ambient deadline')
  const env = { [deadlineVariable]: String(epoch + 60), CUSTOM_QUALITY_SETTING: 'preserved' }
  const before = { ...env }
  const { report, options, spawn } = commandFixture(env)
  nightlyQualityCommand(report, options, 'pnpm', ['run', 'quality'])
  expect(spawn).toHaveBeenCalledWith('pnpm', ['run', 'quality'], expect.objectContaining({
    timeout: 59_750,
    env: { ...env, COREPACK_ENABLE_AUTO_PIN: '0', NO_COLOR: '1', FORCE_COLOR: '0' },
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  }))
  expect(env).toEqual(before)
})

it('does not inherit an ambient deadline when the explicit environment omits it', () => {
  vi.stubEnv(deadlineVariable, String(epoch - 1))
  const { report, options, spawn } = commandFixture({})
  nightlyQualityCommand(report, options, 'pnpm', ['run', 'quality'], 1234)
  expect(spawn).toHaveBeenCalledWith('pnpm', ['run', 'quality'], expect.objectContaining({ timeout: 1234 }))
})

it.each([
  '',
  ' ',
  '0',
  '-1',
  '+1700000001',
  '1700000001.5',
  '1.7e9',
  '1700000001 ',
  '1700000001\n',
  'NaN',
  'Infinity',
  '9007199254741',
  String(Number.MAX_SAFE_INTEGER),
  '9'.repeat(400),
])('rejects invalid epoch seconds %j before spawning or adding a command record', (value) => {
  const { report, options, spawn } = commandFixture({ [deadlineVariable]: value })
  expect(() => nightlyQualityCommand(report, options, 'pnpm', ['run', 'quality'])).toThrow(invalidDeadline)
  expect(spawn).not.toHaveBeenCalled()
  expect(report.commands).toEqual([])
})

it.each([-1, 0])('does not spawn at or after the shared deadline with offset %s seconds', (offset) => {
  vi.mocked(Date.now).mockReturnValue(epoch * 1000)
  const { report, options, spawn } = commandFixture({ [deadlineVariable]: String(epoch + offset) })
  expect(() => nightlyQualityCommand(report, options, 'pnpm', ['run', 'quality'])).toThrow(exhaustedBudget)
  expect(spawn).not.toHaveBeenCalled()
  expect(report.commands).toEqual([])
})

it('preserves a positive subsecond remainder without rounding it away', () => {
  vi.mocked(Date.now).mockReturnValue(epoch * 1000 + 999)
  const { report, options, spawn } = commandFixture({ [deadlineVariable]: String(epoch + 1) })
  nightlyQualityCommand(report, options, 'pnpm', ['run', 'quality'])
  expect(spawn).toHaveBeenCalledWith('pnpm', ['run', 'quality'], expect.objectContaining({ timeout: 1 }))
})

it.each([
  String(epoch + 2_147_484),
  '9007199254740',
])('caps a valid distant deadline %s to the supported timer range', (value) => {
  const { report, options, spawn } = commandFixture({ [deadlineVariable]: value })
  nightlyQualityCommand(report, options, 'pnpm', ['run', 'quality'])
  expect(spawn).toHaveBeenCalledWith('pnpm', ['run', 'quality'], expect.objectContaining({ timeout: maximumTimer }))
})

it('accepts digit-only epoch seconds with leading zeroes', () => {
  const { report, options, spawn } = commandFixture({ [deadlineVariable]: `00${epoch + 1}` })
  nightlyQualityCommand(report, options, 'pnpm', ['run', 'quality'])
  expect(spawn).toHaveBeenCalledWith('pnpm', ['run', 'quality'], expect.objectContaining({ timeout: 750 }))
})

it('decreases the shared budget across commands and refuses to start the next command after exhaustion', () => {
  const { report, options, spawn } = commandFixture({ [deadlineVariable]: String(epoch + 3) })
  nightlyQualityCommand(report, options, 'pnpm', ['run', 'first'])
  vi.mocked(Date.now).mockReturnValue(epoch * 1000 + 1100)
  nightlyQualityCommand(report, options, 'pnpm', ['run', 'second'])
  vi.mocked(Date.now).mockReturnValue(epoch * 1000 + 3000)
  expect(() => nightlyQualityCommand(report, options, 'pnpm', ['run', 'third'])).toThrow(exhaustedBudget)
  expect(spawn).toHaveBeenNthCalledWith(1, 'pnpm', ['run', 'first'], expect.objectContaining({ timeout: 2750 }))
  expect(spawn).toHaveBeenNthCalledWith(2, 'pnpm', ['run', 'second'], expect.objectContaining({ timeout: 1900 }))
  expect(spawn).toHaveBeenCalledTimes(2)
  expect(report.commands.map(command => command.args)).toEqual([['run', 'first'], ['run', 'second']])
})

it('reports the effective shared timeout and retains bounded partial output on a timed out command', () => {
  const { report, options, spawn } = commandFixture({ [deadlineVariable]: String(epoch + 2) })
  const stdout = `early output ${'x'.repeat(8100)} completed suite\n`
  const stderr = `early error ${'y'.repeat(8100)} pending suite\n`
  spawn.mockReturnValueOnce({
    status: null,
    signal: 'SIGTERM',
    error: Object.assign(new Error('spawnSync pnpm ETIMEDOUT'), { code: 'ETIMEDOUT' }),
    stdout,
    stderr,
    pid: 1,
    output: [null, stdout, stderr],
  })
  expect(() => nightlyQualityCommand(report, options, 'pnpm', ['run', 'quality'], 60_000)).toThrow('Nightly pnpm run quality failed: timed out after 1750 ms (spawnSync pnpm ETIMEDOUT)')
  expect(report.commands).toEqual([expect.objectContaining({
    exitCode: null,
    stdout: stdout.slice(-8000),
    stderr: stderr.slice(-8000),
    output: `${stdout}\n${stderr}`.slice(-8000),
  })])
})

it.each([
  { status: 2, error: undefined, stderr: 'assertion failed\n', reason: 'assertion failed' },
  { status: null, error: Object.assign(new Error('spawn pnpm ENOENT'), { code: 'ENOENT' }), stderr: '', reason: 'spawn pnpm ENOENT' },
])('preserves ordinary command failure diagnostics: $reason', ({ status, error, stderr, reason }) => {
  const { report, options, spawn } = commandFixture({ [deadlineVariable]: String(epoch + 2) })
  spawn.mockReturnValueOnce({ status, error, signal: null, stdout: 'partial output\n', stderr, pid: 1, output: [null, 'partial output\n', stderr] })
  expect(() => nightlyQualityCommand(report, options, 'pnpm', ['run', 'quality'])).toThrow(`Nightly pnpm run quality failed: ${reason}`)
  expect(report.commands).toEqual([expect.objectContaining({ exitCode: status, stdout: 'partial output\n', stderr })])
})

it.each([
  { timeout: undefined, expected: 600_000 },
  { timeout: 123_456, expected: 123_456 },
])('keeps the independent publication timeout $expected after the quality deadline expires', ({ timeout, expected }) => {
  const { report, options, spawn } = commandFixture({ [deadlineVariable]: String(epoch - 1) })
  nightlyCommand(report, options, 'node', ['publisher', 'publish'], timeout)
  expect(spawn).toHaveBeenCalledWith('node', ['publisher', 'publish'], expect.objectContaining({ timeout: expected }))
  expect(report.commands).toEqual([expect.objectContaining({ exitCode: 0, executable: 'node', args: ['publisher', 'publish'] })])
})
