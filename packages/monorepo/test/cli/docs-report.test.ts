import type { DocsDeploymentReport } from '@/commands/docs/types'
import process from 'node:process'
import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerDocsCommands } from '@/cli/commands/docs'
import { DocsDeploymentError } from '@/commands/docs/report'

const calls = vi.hoisted(() => ({ deployDocs: vi.fn(), planDocsDeployment: vi.fn() }))
vi.mock('@/commands/docs', async original => ({ ...await original<typeof import('@/commands/docs')>(), ...calls }))

const initialExitCode = process.exitCode
const spyOutput = (stream: NodeJS.WriteStream) => vi.spyOn(stream, 'write').mockImplementation(() => true)
let stdout: ReturnType<typeof spyOutput>
let stderr: ReturnType<typeof spyOutput>

beforeEach(() => {
  calls.deployDocs.mockReset()
  calls.planDocsDeployment.mockReset()
  stdout = spyOutput(process.stdout)
  stderr = spyOutput(process.stderr)
  process.exitCode = undefined
})

afterEach(() => {
  vi.restoreAllMocks()
  process.exitCode = initialExitCode
})

async function run(args: string[]) {
  const program = new Command()
  registerDocsCommands(program, '/workspace')
  await program.parseAsync(['docs', ...args], { from: 'user' })
}

function failedReport(): DocsDeploymentReport {
  return {
    schemaVersion: 1,
    site: 'guide',
    channel: 'stable',
    startedAt: '2026-10-23T00:00:00.000Z',
    elapsedMs: 12,
    status: 'failed',
    failedStage: 'readiness',
    resumablePhase: 'verifying',
    stages: [{ stage: 'readiness', status: 'failed', elapsedMs: 12, reason: 'identity-mismatch' }],
  }
}

describe('documentation CLI reports', () => {
  it('passes JSON transport selection and prints exactly the successful result', async () => {
    const result = { status: 'deployed', versionId: 'provider-version', report: { status: 'deployed' } }
    calls.deployDocs.mockResolvedValue(result)
    await run(['deploy', 'guide', '--channel', 'preview', '--source-sha', 'source-sha', '--json'])
    expect(calls.deployDocs).toHaveBeenCalledWith({ cwd: '/workspace', site: 'guide', channel: 'preview', sourceSha: 'source-sha', json: true })
    expect(stdout).toHaveBeenCalledExactlyOnceWith(`${JSON.stringify(result)}\n`)
    expect(stderr).not.toHaveBeenCalled()
    expect(process.exitCode).toBeUndefined()
  })

  it('prints only the safe failure report to JSON stdout and exits nonzero', async () => {
    const report = failedReport()
    calls.deployDocs.mockRejectedValue(new DocsDeploymentError(report))
    await run(['deploy', 'guide', '--channel', 'stable', '--release', 'release-id', '--json'])
    expect(stdout).toHaveBeenCalledExactlyOnceWith(`${JSON.stringify(report)}\n`)
    expect(stderr).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
  })

  it('adds safe failure guidance on stderr outside JSON mode', async () => {
    const error = new DocsDeploymentError(failedReport())
    calls.deployDocs.mockRejectedValue(error)
    await run(['deploy', 'guide', '--channel', 'stable'])
    expect(stdout).toHaveBeenCalledExactlyOnceWith(`${JSON.stringify(error.report, null, 2)}\n`)
    expect(stderr).toHaveBeenCalledExactlyOnceWith(`${error.message}\n`)
    expect(process.exitCode).toBe(1)
  })

  it('preserves plan JSON and ineligible exit behavior', async () => {
    const plan = { eligible: false, blockers: ['missing publication evidence'] }
    calls.planDocsDeployment.mockResolvedValue(plan)
    await run(['plan', 'guide', '--channel', 'stable', '--commits', 'correction-sha', '--json'])
    expect(calls.planDocsDeployment).toHaveBeenCalledWith({ cwd: '/workspace', site: 'guide', channel: 'stable', commits: ['correction-sha'], json: true })
    expect(stdout).toHaveBeenCalledExactlyOnceWith(`${JSON.stringify(plan)}\n`)
    expect(calls.deployDocs).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
  })

  it('does not consume unrelated errors as successful CLI completion', async () => {
    const error = new Error('unexpected command failure')
    calls.planDocsDeployment.mockRejectedValue(error)
    await expect(run(['plan', 'guide', '--channel', 'preview', '--json'])).rejects.toBe(error)
    expect(stdout).not.toHaveBeenCalled()
  })
})
