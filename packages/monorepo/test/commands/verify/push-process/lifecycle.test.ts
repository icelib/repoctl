import { spawn } from 'node:child_process'
import { once } from 'node:events'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { PushCommandFailure, runPushCommand } from '@/commands/verify/pre-push/commands'
import { createProcessFixture, processRunning, readReadyPid } from './fixtures'

describe('owned pre-push process lifetime', () => {
  it.each(['SIGINT', 'SIGTERM'] as const)('waits for descendants after the leader exits on %s', async (signal) => {
    const unrelated = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      stdio: 'ignore',
      detached: process.platform !== 'win32',
    })
    const unrelatedClosed = once(unrelated, 'close')
    const fixture = await createProcessFixture()
    try {
      const [leaderPid, descendantPid] = await Promise.all([
        readReadyPid(fixture.leaderTrace),
        readReadyPid(fixture.descendantTrace),
      ])
      expect(processRunning(leaderPid)).toBe(true)
      expect(processRunning(descendantPid)).toBe(true)
      const started = Date.now()
      fixture.controller.abort(signal)
      const { error } = await fixture.result

      expect(error).toBeInstanceOf(PushCommandFailure)
      expect(error).toMatchObject({ exitCode: signal === 'SIGINT' ? 130 : 143 })
      expect(processRunning(leaderPid)).toBe(false)
      expect(processRunning(descendantPid)).toBe(false)
      expect(processRunning(unrelated.pid!)).toBe(true)
      if (process.platform !== 'win32') {
        // The descendant ignores the graceful signal. The leader's close must
        // not cancel the delayed group-wide SIGKILL or settle verification.
        expect(Date.now() - started).toBeGreaterThanOrEqual(4500)
      }
    }
    finally {
      unrelated.kill('SIGKILL')
      await unrelatedClosed
      await fixture.cleanup()
    }
  }, 20000)

  it('finishes successful commands and cleans leftover POSIX group members', async () => {
    if (process.platform === 'win32') {
      // Windows lacks a group identity after the root exits. Its abort tests
      // above exercise exact PID trees while the root is still available.
      await expect(runPushCommand(process.execPath, ['-e', 'process.exit(0)'], process.cwd(), process.env, new AbortController().signal))
        .resolves
        .toBeUndefined()
      return
    }
    const fixture = await createProcessFixture(true)
    try {
      const descendantPid = await readReadyPid(fixture.descendantTrace)
      expect((await fixture.result).error).toBeUndefined()
      expect(processRunning(descendantPid)).toBe(false)
    }
    finally {
      await fixture.cleanup()
    }
  }, 20000)
})
