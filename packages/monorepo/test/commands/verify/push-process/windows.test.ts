import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PushProcessCleanupError, stopPushProcessTree } from '@/commands/verify/pre-push/commands/process-tree'

vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:child_process')>()
  return { ...original, spawn: vi.fn() }
})

beforeEach(() => vi.mocked(spawn).mockReset())
afterEach(() => vi.useRealTimers())

describe('Windows owned PID tree cleanup', () => {
  it('waits for a single forced tree operation to complete', async () => {
    const killer = new EventEmitter() as ChildProcess
    vi.mocked(spawn).mockReturnValue(killer)
    let settled = false
    const result = stopPushProcessTree(12345, 'SIGTERM', 'win32').then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    expect(spawn).toHaveBeenCalledExactlyOnceWith('taskkill', ['/pid', '12345', '/t', '/f'], { stdio: 'ignore' })
    killer.emit('close', 0, null)
    await result
    expect(settled).toBe(true)
  })

  it('preserves a taskkill failure so the snapshot can be retained', async () => {
    const killer = new EventEmitter() as ChildProcess
    vi.mocked(spawn).mockReturnValue(killer)
    const result = stopPushProcessTree(12345, 'SIGTERM', 'win32')
    const assertion = expect(result).rejects.toMatchObject({
      message: 'Could not stop pre-push process tree 12345.',
      cause: { message: 'taskkill exited with 128.' },
    })
    killer.emit('close', 128, null)
    await assertion
  })

  it('waits for taskkill close after a spawn error without an unhandled rejection', async () => {
    const killer = new EventEmitter() as ChildProcess
    vi.mocked(spawn).mockReturnValue(killer)
    let settled = false
    const failure = new Error('taskkill ENOENT')
    const result = stopPushProcessTree(12345, 'SIGINT', 'win32').catch((error) => {
      settled = true
      return error
    })
    killer.emit('error', failure)
    await Promise.resolve()
    expect(settled).toBe(false)
    killer.emit('close', -2, null)
    expect(await result).toBeInstanceOf(PushProcessCleanupError)
    expect(await result).toMatchObject({ cause: failure })
  })

  it('bounds a hung taskkill and terminates only that helper', async () => {
    vi.useFakeTimers()
    const killer = Object.assign(new EventEmitter(), { kill: vi.fn(), unref: vi.fn() }) as unknown as ChildProcess
    vi.mocked(spawn).mockReturnValue(killer)
    const result = stopPushProcessTree(12345, 'SIGTERM', 'win32')
    const assertion = expect(result).rejects.toMatchObject({ cause: { message: 'taskkill did not finish within 5 seconds.' } })
    await vi.advanceTimersByTimeAsync(5000)
    await assertion
    expect(killer.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL')
    expect(killer.unref).toHaveBeenCalledOnce()
    // Any later helper event still has its original listeners.
    killer.emit('error', new Error('late taskkill error'))
    killer.emit('close', 1, null)
  })
})
