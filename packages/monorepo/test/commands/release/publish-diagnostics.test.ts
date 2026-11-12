import type { runPublishAttempt } from '../../../src/commands/release/publish/command'
import process from 'node:process'
import { afterEach, expect, it, vi } from 'vitest'
import { publishWithRetry } from '../../../src/commands/release/publish'
import { publishCommandError } from '../../../src/commands/release/publish/diagnostics'
import { publishSnapshotArtifacts } from '../../../src/commands/release/snapshot/publish'
import { cleanupReleaseTempRoots, createTempWorkspace } from '../release-fixtures'
import { publicationFixture } from './snapshot/publication/fixture'

afterEach(async () => {
  vi.restoreAllMocks()
  await cleanupReleaseTempRoots()
})

it('includes the rejected upload reason in quiet snapshot failure reports', async () => {
  const h = await publicationFixture()
  const registrySpawn = h.spawn.getMockImplementation()!
  h.spawn.mockImplementation((command, args, settings) => command === 'pnpm'
    ? { status: 1, stdout: 'Publishing first', stderr: 'E403 registry rejected provenance', signal: null, pid: 1, output: [] }
    : registrySpawn(command, args, settings))
  const error = await publishSnapshotArtifacts(h.report, h.options, async () => {}).catch((error: unknown) => error)
  expect(error).toBeInstanceOf(Error)
  expect(JSON.stringify({ error: (error as Error).message })).toContain('E403 registry rejected provenance')
  expect((error as Error).message).toContain('exit=1')
  expect(h.spawn.mock.calls.filter(([command]) => command === 'pnpm')).toHaveLength(1)
  expect(await h.progress()).toMatchObject({ status: 'failed', acceptedPackages: [] })
})

it('preserves the last transient failure after bounded retries without printing into JSON stdout', async () => {
  const cwd = await createTempWorkspace('main')
  const stdout = vi.spyOn(process.stdout, 'write')
  const stderr = vi.spyOn(process.stderr, 'write')
  let uploads = 0
  const spawn = vi.fn((command: string) => command === 'pnpm'
    ? { status: 1, stdout: '', stderr: `HTTP 503 upload attempt ${++uploads}` }
    : { status: 1, stdout: '', stderr: 'E404 Not Found' })
  await expect(publishWithRetry(['publish', 'package.tgz'], { cwd, spawn: spawn as never, quiet: true, sleep: async () => {} }, [{ name: 'repoctl', version: '1.0.0' }]))
    .rejects
    .toThrow('HTTP 503 upload attempt 3')
  expect(uploads).toBe(3)
  expect(stdout).not.toHaveBeenCalled()
  expect(stderr).not.toHaveBeenCalled()
})

it('retains spawn errors and signals with absent output', () => {
  const result = { status: null, signal: 'SIGTERM', error: new Error('spawn pnpm ENOENT'), stdout: '', stderr: '', output: '' } as ReturnType<typeof runPublishAttempt>
  const error = publishCommandError('command failed', result, { cwd: '.' })
  expect(error.message).toContain('exit=unknown signal=SIGTERM')
  expect(error.message).toContain('spawn pnpm ENOENT')
  expect(error.exitCode).toBe(1)
})

it('bounds diagnostics after redacting credentials and strips terminal escapes', () => {
  const tokens = ['secret-oidc', 'secret-npm', 'secret-github', 'npm_abc123', 'ghp_abc123', 'github_pat_abc123', 'eyJabc.def.ghi']
  const result = { status: 1, signal: null, stdout: `\u001B[31m${'x'.repeat(10_000)}\u001B[0m`, stderr: `E401 ${tokens.join(' ')}` } as ReturnType<typeof runPublishAttempt>
  const error = publishCommandError('command failed', result, { cwd: '.', env: { ACTIONS_ID_TOKEN_REQUEST_TOKEN: tokens[0], NPM_TOKEN: tokens[1], GITHUB_TOKEN: tokens[2] } })
  expect(error.message.length).toBeLessThan(8_100)
  expect(error.message).toContain('E401 [redacted]')
  for (const token of tokens) {
    expect(error.message).not.toContain(token)
  }
  expect(error.message).not.toContain('\u001B')
})
