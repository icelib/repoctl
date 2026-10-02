import type * as FileSystem from 'node:fs/promises'
import { link, mkdir, readdir, readFile, symlink, writeFile } from 'node:fs/promises'
import path from 'pathe'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist -- Fault-inject filesystem boundaries in the delivered baseline writer.
import { runKnipCheck, saveKnipBaseline } from '../../../dist/index.mjs'
import { emitPayload, fakeTool, fixture, nativePayload } from './fixture'

const mocks = vi.hoisted(() => ({ open: vi.fn(), link: vi.fn(), rename: vi.fn(), unlink: vi.fn() }))
vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof FileSystem>()
  return { ...actual, ...mocks }
})
const actual = await vi.importActual<typeof FileSystem>('node:fs/promises')
beforeEach(() => {
  for (const key of ['open', 'link', 'rename', 'unlink'] as const) {
    mocks[key].mockImplementation(actual[key])
  }
})
afterEach(() => vi.resetAllMocks())

async function prepared() {
  const h = await fixture({ tool: false })
  await fakeTool(h.workspace, emitPayload(nativePayload()))
  return { ...h, report: await runKnipCheck(h.workspace), target: path.join(h.workspace, 'baseline.json') }
}

it('preserves a new destination that appears concurrently and cleans only its own temporary file', async () => {
  const h = await prepared()
  mocks.link.mockImplementationOnce(async (source: string, target: string) => {
    await writeFile(target, 'concurrent user file')
    return actual.link(source, target)
  })
  await expect(saveKnipBaseline(h.workspace, h.report, h.target)).rejects.toThrow()
  expect(await readFile(h.target, 'utf8')).toBe('concurrent user file')
  expect((await readdir(h.workspace)).some(name => name.includes('.repoctl-knip-'))).toBe(false)
})

it('detects a concurrent existing baseline edit before replacement', async () => {
  const h = await prepared()
  await saveKnipBaseline(h.workspace, h.report, h.target)
  const changed = { ...h.report, scope: { ...h.report.scope!, rootName: 'changed' } }
  mocks.open.mockImplementationOnce(async (...args: Parameters<typeof FileSystem.open>) => {
    await writeFile(h.target, 'concurrent baseline edit')
    return actual.open(...args)
  })
  await expect(saveKnipBaseline(h.workspace, changed, h.target)).rejects.toThrow(/concurrently/)
  expect(await readFile(h.target, 'utf8')).toBe('concurrent baseline edit')
})

it('preserves the original baseline on rename failure and reports a retained partial write', async () => {
  const h = await prepared()
  await saveKnipBaseline(h.workspace, h.report, h.target)
  const original = await readFile(h.target, 'utf8')
  const changed = { ...h.report, scope: { ...h.report.scope!, rootName: 'changed' } }
  mocks.rename.mockRejectedValueOnce(new Error('injected rename failure'))
  await expect(saveKnipBaseline(h.workspace, changed, h.target)).rejects.toThrow(/rename failure/)
  expect(await readFile(h.target, 'utf8')).toBe(original)
  mocks.open.mockImplementationOnce(async (...args: Parameters<typeof FileSystem.open>) => {
    const handle = await actual.open(...args)
    handle.writeFile = async () => {
      await handle.write('partial')
      throw new Error('injected write failure')
    }
    return handle
  })
  await expect(saveKnipBaseline(h.workspace, changed, h.target)).rejects.toThrow(/retained temporary file/)
  expect(await readFile(h.target, 'utf8')).toBe(original)
  const temporary = (await readdir(h.workspace)).find(name => name.includes('.repoctl-knip-'))!
  expect(await readFile(path.join(h.workspace, temporary), 'utf8')).toBe('partial')
})

it('reports cleanup failure after successful exclusive creation without losing the baseline', async () => {
  const h = await prepared()
  mocks.unlink.mockRejectedValueOnce(new Error('injected cleanup failure'))
  const saved = await saveKnipBaseline(h.workspace, h.report, h.target)
  expect(saved.status).toBe('created')
  expect(saved.cleanupPending).toHaveLength(1)
  expect(await readFile(saved.cleanupPending[0]!, 'utf8')).toBe(await readFile(h.target, 'utf8'))
})

it('closes and identifies the temporary file when its ownership metadata cannot be read', async () => {
  const h = await prepared()
  let closed = false
  mocks.open.mockImplementationOnce(async (...args: Parameters<typeof FileSystem.open>) => {
    const handle = await actual.open(...args)
    const close = handle.close.bind(handle)
    handle.stat = async () => {
      throw new Error('injected fstat failure')
    }
    handle.close = async () => {
      closed = true
      await close()
    }
    return handle
  })
  await expect(saveKnipBaseline(h.workspace, h.report, h.target)).rejects.toThrow(/retained temporary file/)
  expect(closed).toBe(true)
  const temporary = (await readdir(h.workspace)).find(name => name.includes('.repoctl-knip-'))!
  expect(await readFile(path.join(h.workspace, temporary), 'utf8')).toBe('')
})

it('rejects linked baseline files and ancestors', async () => {
  const h = await prepared()
  await saveKnipBaseline(h.workspace, h.report, 'original.json')
  await link(path.join(h.workspace, 'original.json'), h.target)
  await expect(saveKnipBaseline(h.workspace, h.report, h.target)).rejects.toThrow(/link/i)
  await mkdir(path.join(h.root, 'outside'))
  await symlink(path.join(h.root, 'outside'), path.join(h.workspace, 'linked'), 'junction')
  await expect(saveKnipBaseline(h.workspace, h.report, 'linked/baseline.json')).rejects.toThrow(/link/i)
})
