import type { CheckExecutionTask } from '@/commands/check/types'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { executeCheckTask } from '@/commands/check/process'

function task(executable: string, args: string[] = []): CheckExecutionTask {
  return { name: 'fixture', command: executable, executable, args, cwd: process.cwd(), status: 'skipped', startedAt: null, endedAt: null, durationMs: 0, exitCode: null, signal: null }
}

describe('check subprocess lifecycle', () => {
  it('records a command startup failure without throwing or leaking arbitrary errors', async () => {
    const result = task('repoctl-nonexistent-command-941')
    await executeCheckTask(result)
    expect(result).toMatchObject({ status: 'failed', exitCode: null, errorCode: 'ENOENT', reason: 'command_start_failed' })
    expect(result.startedAt).toBeTypeOf('string')
    expect(result.endedAt).toBeTypeOf('string')
  })

  it.skipIf(process.platform === 'win32')('reports a child terminating itself by signal', async () => {
    const result = task(process.execPath, ['-e', 'process.kill(process.pid,"SIGTERM")'])
    await executeCheckTask(result)
    expect(result).toMatchObject({ status: 'interrupted', exitCode: null, signal: 'SIGTERM' })
  })

  it('cancels a running child using AbortSignal', async () => {
    const controller = new AbortController()
    const result = task(process.execPath, ['-e', 'setInterval(() => {}, 1000)'])
    const pending = executeCheckTask(result, controller.signal)
    controller.abort('SIGINT')
    await pending
    expect(result).toMatchObject({ status: 'interrupted', signal: 'SIGINT' })
  })
})
