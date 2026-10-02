import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockProgram } from './helpers'

afterEach(async () => {
  await vi.resetModules()
  vi.restoreAllMocks()
  vi.resetAllMocks()
})

describe('commander program doctor exit code', () => {
  it('marks the process as failed when doctor finds blocking issues', async () => {
    const doctorMock = vi.fn(async () => ({
      cwd: '/repo',
      workspaceDir: '/repo',
      packageCount: 0,
      checks: [],
      summary: { pass: 2, warn: 1, fail: 1 },
    }))

    mockProgram()
    vi.doMock('@/commands', () => ({
      runDoctor: doctorMock,
    }))

    const errorMock = vi.fn()
    vi.doMock('@/core/logger', () => ({
      logger: {
        success: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: errorMock,
        log: vi.fn(),
      },
    }))

    const previousExitCode = process.exitCode
    process.exitCode = undefined

    const { default: program } = await import('@/cli/program')
    await program.parseAsync(['node', 'repo', 'doctor'])

    expect(process.exitCode).toBe(1)
    expect(errorMock).toHaveBeenCalledWith('Doctor found 1 blocking issue(s).')

    process.exitCode = previousExitCode
  })

  it('treats warnings as failures in strict mode', async () => {
    const doctorMock = vi.fn(async () => ({
      cwd: '/repo',
      workspaceDir: '/repo',
      packageCount: 1,
      checks: [],
      summary: { pass: 7, warn: 2, fail: 0 },
    }))

    mockProgram()
    vi.doMock('@/commands', () => ({
      runDoctor: doctorMock,
    }))

    const errorMock = vi.fn()
    const warnMock = vi.fn()
    vi.doMock('@/core/logger', () => ({
      logger: {
        success: vi.fn(),
        info: vi.fn(),
        warn: warnMock,
        error: errorMock,
        log: vi.fn(),
      },
    }))

    const previousExitCode = process.exitCode
    process.exitCode = undefined

    const { default: program } = await import('@/cli/program')
    await program.parseAsync(['node', 'repo', 'doctor', '--strict'])

    expect(process.exitCode).toBe(1)
    expect(errorMock).toHaveBeenCalledWith('Doctor found 2 warning(s) in strict mode.')
    expect(warnMock).not.toHaveBeenCalled()

    process.exitCode = previousExitCode
  })

  it('keeps strict warning failures machine-readable for json output', async () => {
    const doctorMock = vi.fn(async () => ({
      cwd: '/repo',
      workspaceDir: '/repo',
      packageCount: 1,
      checks: [],
      summary: { pass: 7, warn: 1, fail: 0 },
    }))

    mockProgram()
    vi.doMock('@/commands', () => ({
      runDoctor: doctorMock,
    }))

    const logMock = vi.fn()
    vi.doMock('@/core/logger', () => ({
      logger: {
        error: vi.fn(),
        log: logMock,
      },
    }))

    const previousExitCode = process.exitCode
    process.exitCode = undefined

    const { default: program } = await import('@/cli/program')
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    await program.parseAsync(['node', 'repo', 'doctor', '--strict', '--json'])

    expect(JSON.parse(String(stdout.mock.calls[0]?.[0]))).toMatchObject({ summary: { warn: 1 } })
    expect(logMock).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)

    process.exitCode = previousExitCode
  })
})
