import { afterEach, describe, expect, it, vi } from 'vitest'
import { publishWithRetry } from '@/commands/release/publish'
import { cleanupReleaseTempRoots, createSpawnMock, createTempWorkspace } from './release-fixtures'

afterEach(async () => {
  vi.restoreAllMocks()
  await cleanupReleaseTempRoots()
})

const publishArgs = ['publish', '-r', '--report-summary', '--provenance', '--no-git-checks']

describe('publish retry', () => {
  it('retries transient provenance failures with package filters', async () => {
    const cwd = await createTempWorkspace('main')
    const retry = vi.fn(async () => {})
    const { calls, spawn } = createSpawnMock({
      statusSequences: {
        'pnpm publish -r --report-summary --provenance --no-git-checks': [1],
      },
      stdoutSequences: {
        'pnpm publish -r --report-summary --provenance --no-git-checks': ['CA_CREATE_SIGNING_CERTIFICATE_ERROR'],
        'npm view repoctl@1.0.0 version': ['', '', '1.0.0'],
      },
    })

    await publishWithRetry(publishArgs, { cwd, sleep: retry, spawn: spawn as never }, [{ name: 'repoctl', version: '1.0.0' }])

    expect(calls).toEqual([
      { command: 'pnpm', args: publishArgs },
      { command: 'npm', args: ['view', 'repoctl@1.0.0', 'version'] },
      { command: 'npm', args: ['view', 'repoctl@1.0.0', 'version'] },
      { command: 'pnpm', args: [...publishArgs, '--filter', 'repoctl'] },
      { command: 'npm', args: ['view', 'repoctl@1.0.0', 'version'] },
    ])
    expect(retry).toHaveBeenCalledWith(20_000)
  })

  it('treats a package already present in the registry as successful', async () => {
    const cwd = await createTempWorkspace('main')
    const retry = vi.fn(async () => {})
    const { calls, spawn } = createSpawnMock({
      statusSequences: {
        'pnpm publish -r --report-summary --provenance --no-git-checks': [1],
        'npm view repoctl@1.0.0 version': [0],
      },
      stdoutSequences: {
        'pnpm publish -r --report-summary --provenance --no-git-checks': ['CA_CREATE_SIGNING_CERTIFICATE_ERROR'],
        'npm view repoctl@1.0.0 version': ['1.0.0'],
      },
    })

    await publishWithRetry(publishArgs, { cwd, sleep: retry, spawn: spawn as never }, [{ name: 'repoctl', version: '1.0.0' }])

    expect(calls).toEqual([
      { command: 'pnpm', args: publishArgs },
      { command: 'npm', args: ['view', 'repoctl@1.0.0', 'version'] },
    ])
    expect(retry).not.toHaveBeenCalled()
  })

  it('does not retry unrelated authorization failures', async () => {
    const cwd = await createTempWorkspace('main')
    const retry = vi.fn(async () => {})
    const { calls, spawn } = createSpawnMock({
      statusSequences: {
        'pnpm publish -r --report-summary --provenance --no-git-checks': [1],
        'npm view repoctl@1.0.0 version': [1],
      },
      stdoutSequences: {
        'pnpm publish -r --report-summary --provenance --no-git-checks': ['E403 forbidden to publish this package'],
      },
    })

    await expect(
      publishWithRetry(publishArgs, { cwd, sleep: retry, spawn: spawn as never }, [{ name: 'repoctl', version: '1.0.0' }]),
    ).rejects.toThrow('command failed: pnpm publish -r --report-summary --provenance --no-git-checks')
    expect(calls).toHaveLength(2)
    expect(retry).not.toHaveBeenCalled()
  })

  it('fails after exhausting transient publish attempts', async () => {
    const cwd = await createTempWorkspace('main')
    const retry = vi.fn(async () => {})
    const filteredArgs = [...publishArgs, '--filter', 'repoctl']
    const { calls, spawn } = createSpawnMock({
      statusSequences: {
        [`pnpm ${publishArgs.join(' ')}`]: [1],
        [`pnpm ${filteredArgs.join(' ')}`]: [1, 1],
      },
      stdoutSequences: {
        [`pnpm ${publishArgs.join(' ')}`]: ['CA_CREATE_SIGNING_CERTIFICATE_ERROR'],
        [`pnpm ${filteredArgs.join(' ')}`]: ['CA_CREATE_SIGNING_CERTIFICATE_ERROR', 'CA_CREATE_SIGNING_CERTIFICATE_ERROR'],
      },
    })

    await expect(
      publishWithRetry(publishArgs, { cwd, sleep: retry, spawn: spawn as never }, [{ name: 'repoctl', version: '1.0.0' }]),
    ).rejects.toThrow('command failed after 3 publish attempts')
    expect(calls.filter(call => call.command === 'pnpm')).toHaveLength(3)
    expect(retry).toHaveBeenCalledTimes(2)
  })
})
