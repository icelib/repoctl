import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { Command } from 'commander'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { registerBootstrap } from '@/cli/commands/release/bootstrap'

const calls = vi.hoisted(() => ({ releaseBootstrap: vi.fn() }))
vi.mock('@/commands/release/bootstrap', () => calls)

const initialExitCode = process.exitCode
const directories: string[] = []
const spyOutput = (stream: NodeJS.WriteStream) => vi.spyOn(stream, 'write').mockReturnValue(true)
let stdout: ReturnType<typeof spyOutput>
let stderr: ReturnType<typeof spyOutput>

beforeEach(() => {
  calls.releaseBootstrap.mockReset().mockResolvedValue({ schemaVersion: 1, status: 'planned' })
  stdout = spyOutput(process.stdout)
  stderr = spyOutput(process.stderr)
  process.exitCode = undefined
})

afterEach(async () => {
  vi.restoreAllMocks()
  process.exitCode = initialExitCode
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function run(args: string[], cwd = '.') {
  const program = new Command()
  registerBootstrap(program.command('release'), cwd)
  await program.parseAsync(['release', 'bootstrap', '--package', '@scope/new', '--version', '1.0.0-alpha.0', ...args], { from: 'user' })
}

it('defaults to prepare with alpha and prints the safe JSON result', async () => {
  await run(['--json'])
  expect(calls.releaseBootstrap).toHaveBeenCalledExactlyOnceWith({ cwd: '.', packageName: '@scope/new', version: '1.0.0-alpha.0', tag: 'alpha', stage: 'prepare', quiet: true })
  expect(stdout).toHaveBeenCalledExactlyOnceWith(`${JSON.stringify({ schemaVersion: 1, status: 'planned' }, null, 2)}\n`)
  expect(stderr).not.toHaveBeenCalled()
  expect(process.exitCode).toBeUndefined()
})

it('keeps output artifacts and an extra JSON report separate', async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'bootstrap-cli-'))
  directories.push(cwd)
  await run(['--stage', 'prepare', '--tag', 'preview', '--run-id', '123', '--run-attempt', '2', '--output', 'artifacts', '--out', 'reports/result.json', '--dry-run', '--json'], cwd)
  expect(calls.releaseBootstrap).toHaveBeenCalledExactlyOnceWith({ cwd, packageName: '@scope/new', version: '1.0.0-alpha.0', tag: 'preview', stage: 'prepare', runId: 123, runAttempt: 2, outputDirectory: 'artifacts', dryRun: true, quiet: true })
  expect(await readFile(path.join(cwd, 'reports/result.json'), 'utf8')).toBe(String(stdout.mock.calls[0]![0]))
})

it('requests quiet publication only when JSON output was selected', async () => {
  calls.releaseBootstrap.mockResolvedValue({ schemaVersion: 1, status: 'published' })
  await run(['--stage', 'publish', '--json'])
  expect(calls.releaseBootstrap).toHaveBeenLastCalledWith(expect.objectContaining({ stage: 'publish', quiet: true }))
  expect(stdout).toHaveBeenCalledExactlyOnceWith(`${JSON.stringify({ schemaVersion: 1, status: 'published' }, null, 2)}\n`)
  calls.releaseBootstrap.mockClear()
  await run(['--stage', 'publish'])
  expect(calls.releaseBootstrap).toHaveBeenCalledExactlyOnceWith({ cwd: '.', packageName: '@scope/new', version: '1.0.0-alpha.0', tag: 'alpha', stage: 'publish' })
})

it('forces verify-only recovery even when publish was selected explicitly', async () => {
  await run(['--stage', 'publish', '--verify-run-id', '321'])
  expect(calls.releaseBootstrap).toHaveBeenCalledWith(expect.objectContaining({ stage: 'verify', verifyRunId: 321 }))
})

it.each([
  ['--stage', 'upload'],
  ['--run-id', '0'],
  ['--run-attempt', '-1'],
  ['--verify-run-id', '1.5'],
  ['--run-id', '9007199254740992'],
])('rejects invalid stage or identity before executing bootstrap: %j', async (...args) => {
  await run(args)
  expect(calls.releaseBootstrap).not.toHaveBeenCalled()
  expect(stderr).toHaveBeenCalledTimes(1)
  expect(process.exitCode).toBe(1)
})

it('prints a failed safe report and exits nonzero', async () => {
  const report = { schemaVersion: 1, status: 'failed', error: 'Artifact identity mismatch' }
  calls.releaseBootstrap.mockResolvedValue(report)
  await run(['--json'])
  expect(stdout).toHaveBeenCalledExactlyOnceWith(`${JSON.stringify(report, null, 2)}\n`)
  expect(stderr).not.toHaveBeenCalled()
  expect(process.exitCode).toBe(1)
})
