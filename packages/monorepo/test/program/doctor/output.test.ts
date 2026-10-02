import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'pathe'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockProgram } from './helpers'

afterEach(async () => {
  await vi.resetModules()
  vi.restoreAllMocks()
  vi.resetAllMocks()
})

describe('commander program doctor output', () => {
  it('prints doctor report as json and keeps failing exit code', async () => {
    const doctorMock = vi.fn(async () => ({
      cwd: '/repo',
      workspaceDir: '/repo',
      packageCount: 0,
      checks: [
        {
          id: 'package-json',
          title: 'package.json',
          status: 'fail',
          detail: 'missing',
        },
      ],
      summary: { pass: 0, warn: 0, fail: 1 },
    }))

    mockProgram()
    vi.doMock('@/commands', () => ({
      runDoctor: doctorMock,
    }))

    const errorMock = vi.fn()
    const logMock = vi.fn()
    vi.doMock('@/core/logger', () => ({
      logger: {
        error: errorMock,
        log: logMock,
      },
    }))

    const previousExitCode = process.exitCode
    process.exitCode = undefined

    const { default: program } = await import('@/cli/program')
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    await program.parseAsync(['node', 'repo', 'doctor', '--json'])

    expect(JSON.parse(String(stdout.mock.calls[0]?.[0]))).toMatchObject({ summary: { fail: 1 } })
    expect(logMock).not.toHaveBeenCalled()
    expect(errorMock).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)

    process.exitCode = previousExitCode
  })

  it('writes doctor report to a file and keeps failing exit code', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'repo-doctor-report-'))
    const doctorMock = vi.fn(async () => ({
      cwd: root,
      workspaceDir: root,
      packageCount: 0,
      checks: [
        {
          id: 'package-json',
          title: 'package.json',
          status: 'fail',
          detail: 'missing',
        },
      ],
      summary: { pass: 0, warn: 0, fail: 1 },
    }))

    try {
      mockProgram()
      vi.doMock('@/commands', () => ({
        runDoctor: doctorMock,
      }))

      const logMock = vi.fn()
      const successMock = vi.fn()
      vi.doMock('@/core/logger', () => ({
        logger: {
          error: vi.fn(),
          log: logMock,
          success: successMock,
        },
      }))

      const previousExitCode = process.exitCode
      process.exitCode = undefined
      const reportPath = path.join(root, 'reports/doctor.json')

      const { default: program } = await import('@/cli/program')
      await program.parseAsync(['node', 'repo', 'doctor', '--json', '--out', reportPath])

      expect(JSON.parse(await readFile(reportPath, 'utf8'))).toEqual(expect.objectContaining({
        summary: { pass: 0, warn: 0, fail: 1 },
      }))
      expect(logMock).not.toHaveBeenCalledWith(expect.stringContaining('"summary"'))
      expect(successMock).toHaveBeenCalledWith(expect.stringContaining('doctor.json'))
      expect(process.exitCode).toBe(1)

      process.exitCode = previousExitCode
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('writes doctor report as markdown and keeps failing exit code', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'repo-doctor-markdown-'))
    const doctorMock = vi.fn(async () => ({
      cwd: root,
      workspaceDir: root,
      packageCount: 1,
      checks: [
        {
          id: 'root-scripts',
          title: 'root scripts',
          status: 'warn',
          detail: 'missing doctor script',
          fix: 'run repo upgrade',
        },
      ],
      summary: { pass: 2, warn: 1, fail: 0 },
    }))

    try {
      mockProgram()
      vi.doMock('@/commands', () => ({
        runDoctor: doctorMock,
      }))

      const successMock = vi.fn()
      vi.doMock('@/core/logger', () => ({
        logger: {
          error: vi.fn(),
          log: vi.fn(),
          success: successMock,
        },
      }))

      const previousExitCode = process.exitCode
      process.exitCode = undefined
      const reportPath = path.join(root, 'reports/doctor.md')

      const { default: program } = await import('@/cli/program')
      await program.parseAsync(['node', 'repo', 'doctor', '--strict', '--markdown', '--out', reportPath])

      const content = await readFile(reportPath, 'utf8')
      expect(content).toContain('# Repo doctor report')
      expect(content).toContain('| warn | 1 |')
      expect(content).toContain('- warn: root scripts (fix: run repo upgrade)')
      expect(successMock).toHaveBeenCalledWith(expect.stringContaining('doctor.md'))
      expect(process.exitCode).toBe(1)

      process.exitCode = previousExitCode
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('redacts local absolute paths from markdown doctor output', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'repo-doctor-redact-'))
    const reportPath = path.join(root, 'reports/doctor.md')
    const doctorMock = vi.fn(async () => ({
      cwd: root,
      workspaceDir: root,
      packageCount: 1,
      checks: [
        {
          id: 'root-scripts',
          title: 'root scripts',
          status: 'warn',
          detail: `missing script in ${path.join(root, 'package.json')}`,
          fix: `run repo upgrade from ${root}`,
        },
      ],
      summary: { pass: 2, warn: 1, fail: 0 },
    }))

    try {
      mockProgram()
      vi.doMock('@/commands', () => ({
        runDoctor: doctorMock,
      }))
      vi.doMock('@/core/logger', () => ({
        logger: {
          error: vi.fn(),
          log: vi.fn(),
          success: vi.fn(),
        },
      }))

      const previousExitCode = process.exitCode
      process.exitCode = undefined

      const { default: program } = await import('@/cli/program')
      await program.parseAsync(['node', 'repo', 'doctor', '--markdown', '--redact', '--out', reportPath])

      const content = await readFile(reportPath, 'utf8')
      expect(content).not.toContain(root)
      expect(content).toContain('| workspace | <workspace> |')
      expect(content).toContain('- warn: root scripts (fix: run repo upgrade from <workspace>)')
      expect(process.exitCode).toBeUndefined()

      process.exitCode = previousExitCode
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
