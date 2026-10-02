import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import process from 'node:process'
import spawn from 'cross-spawn'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PushCommandFailure, PushProcessCleanupError, runPushCommand } from '@/commands/verify/pre-push/commands'
import { stopPushProcessTree } from '@/commands/verify/pre-push/commands/process-tree'

vi.mock('cross-spawn', () => ({ default: vi.fn() }))
vi.mock('@/commands/verify/pre-push/commands/process-tree', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/commands/verify/pre-push/commands/process-tree')>()
  return { ...original, stopPushProcessTree: vi.fn() }
})

function createChild(pid: number | undefined = 45678) {
  return Object.assign(new EventEmitter(), { pid, unref: vi.fn() }) as unknown as ChildProcess
}

function run(controller: AbortController) {
  return runPushCommand('pnpm', ['test'], process.cwd(), {}, controller.signal)
}

beforeEach(() => {
  vi.mocked(spawn).mockReset()
  vi.mocked(stopPushProcessTree).mockReset().mockResolvedValue(undefined)
})

describe('pre-push executor races and errors', () => {
  it('does not start a command for an already-aborted verification', async () => {
    const controller = new AbortController()
    controller.abort('SIGINT')
    await expect(run(controller)).rejects.toMatchObject({ exitCode: 130 })
    expect(spawn).not.toHaveBeenCalled()
  })

  it('reports spawn errors without inventing a negative exit status', async () => {
    const child = createChild()
    Object.defineProperty(child, 'pid', { value: undefined })
    vi.mocked(spawn).mockReturnValue(child)
    const result = run(new AbortController())
    const assertion = expect(result).rejects.toMatchObject({ exitCode: 1, message: 'spawn pnpm ENOENT' })
    child.emit('error', new Error('spawn pnpm ENOENT'))
    child.emit('close', -2, null)
    await assertion
    expect(stopPushProcessTree).not.toHaveBeenCalled()
  })

  it('waits for tree cleanup when the leader closes first', async () => {
    const child = createChild()
    const controller = new AbortController()
    let finish!: () => void
    vi.mocked(spawn).mockReturnValue(child)
    vi.mocked(stopPushProcessTree).mockReturnValue(new Promise<void>((resolve) => {
      finish = resolve
    }))
    let settled = false
    const result = run(controller).catch(error => error).then((error) => {
      settled = true
      return error
    })
    controller.abort('SIGTERM')
    child.emit('close', 0, null)
    await Promise.resolve()
    await Promise.resolve()
    expect(settled).toBe(false)
    finish()
    expect(await result).toBeInstanceOf(PushCommandFailure)
    expect(stopPushProcessTree).toHaveBeenCalledExactlyOnceWith(child.pid, 'SIGTERM')
  })

  it('reports a cleanup failure even when the leader cannot exit', async () => {
    const child = createChild()
    const controller = new AbortController()
    const failure = new PushProcessCleanupError('permission denied')
    vi.mocked(spawn).mockReturnValue(child)
    vi.mocked(stopPushProcessTree).mockRejectedValue(failure)
    const result = run(controller)
    const assertion = expect(result).rejects.toBe(failure)
    controller.abort('SIGTERM')
    await assertion
    expect(child.unref).toHaveBeenCalledOnce()
    // A late close/error remains handled without triggering another cleanup.
    child.emit('error', new Error('late child error'))
    child.emit('close', 1, null)
    expect(stopPushProcessTree).toHaveBeenCalledOnce()
  })

  it('handles an abort delivered while spawn returns', async () => {
    const child = createChild()
    const controller = new AbortController()
    vi.mocked(spawn).mockImplementation(() => {
      controller.abort('SIGINT')
      return child
    })
    const result = run(controller)
    const assertion = expect(result).rejects.toMatchObject({ exitCode: 130 })
    child.emit('close', null, 'SIGINT')
    await assertion
    expect(stopPushProcessTree).toHaveBeenCalledExactlyOnceWith(child.pid, 'SIGINT')
  })

  it('preserves a failing script status after successful cleanup', async () => {
    const child = createChild()
    vi.mocked(spawn).mockReturnValue(child)
    const result = run(new AbortController())
    const assertion = expect(result).rejects.toMatchObject({ exitCode: 7 })
    child.emit('close', 7, null)
    await assertion
  })
})
