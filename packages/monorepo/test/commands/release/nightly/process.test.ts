import type { NightlyOptions } from '@icebreakers/monorepo'
import { expect, it, vi } from 'vitest'
import { nightlyCommand } from '../../../../src/commands/release/nightly/process'
import { reportFixture } from './provider-fixture'

it.each([
  { label: 'default', timeout: undefined, expected: 600_000 },
  { label: 'explicit', timeout: 123_456, expected: 123_456 },
])('uses the $label command budget and retains successful output', ({ timeout, expected }) => {
  const report = reportFixture()
  const spawn = vi.fn(() => ({ status: 0, signal: null, stdout: '  quality passed\n', stderr: 'quality warning\n', pid: 1, output: [null, '  quality passed\n', 'quality warning\n'] }))
  const options: NightlyOptions = {
    cwd: '/quality-workspace',
    spawn: spawn as unknown as NonNullable<NightlyOptions['spawn']>,
  }
  expect(nightlyCommand(report, options, 'pnpm', ['run', 'test'], timeout)).toBe('quality passed')
  expect(spawn).toHaveBeenCalledWith('pnpm', ['run', 'test'], expect.objectContaining({ cwd: options.cwd, timeout: expected }))
  expect(report.commands).toEqual([{
    cwd: options.cwd,
    executable: 'pnpm',
    args: ['run', 'test'],
    exitCode: 0,
    stdout: '  quality passed\n',
    stderr: 'quality warning\n',
    output: '  quality passed\n\nquality warning\n',
  }])
})

it('identifies the command and explicit budget while retaining partial timeout diagnostics', () => {
  const report = reportFixture()
  const error = Object.assign(new Error('spawnSync pnpm ETIMEDOUT'), { code: 'ETIMEDOUT' })
  const spawn = vi.fn(() => ({ status: null, signal: 'SIGTERM', error, stdout: 'completed suite\n', stderr: 'pending suite\n', pid: 1, output: [null, 'completed suite\n', 'pending suite\n'] }))
  const options: NightlyOptions = { cwd: '/quality-workspace', spawn: spawn as unknown as NonNullable<NightlyOptions['spawn']> }
  expect(() => nightlyCommand(report, options, 'pnpm', ['run', 'test'], 456_789)).toThrow('Nightly pnpm run test failed: timed out after 456789 ms (spawnSync pnpm ETIMEDOUT)')
  expect(spawn).toHaveBeenCalledWith('pnpm', ['run', 'test'], expect.objectContaining({ timeout: 456_789 }))
  expect(report.commands).toEqual([expect.objectContaining({ exitCode: null, stdout: 'completed suite\n', stderr: 'pending suite\n', output: 'completed suite\n\npending suite\n' })])
})

it.each([
  { stderr: 'assertion failed\n', message: 'assertion failed' },
  { stderr: '', message: 'exit code 2' },
])('keeps nonzero failures distinct from timeouts with stderr $stderr', ({ stderr, message }) => {
  const report = reportFixture()
  const spawn = vi.fn(() => ({ status: 2, signal: null, stdout: 'test output\n', stderr, pid: 1, output: [null, 'test output\n', stderr] }))
  const options: NightlyOptions = { cwd: '/quality-workspace', spawn: spawn as unknown as NonNullable<NightlyOptions['spawn']> }
  expect(() => nightlyCommand(report, options, 'pnpm', ['run', 'test'])).toThrow(`Nightly pnpm run test failed: ${message}`)
  expect(report.commands).toEqual([expect.objectContaining({ exitCode: 2, stdout: 'test output\n', stderr })])
})
