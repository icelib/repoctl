import { readdir, readFile, writeFile } from 'node:fs/promises'
import { applyInstallSecurityPreset, planInstallSecurityPreset } from '@icebreakers/monorepo'
import path from 'pathe'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { securityFixture } from './fixture'

const renameMock = vi.hoisted(() => vi.fn())
const removeMock = vi.hoisted(() => vi.fn())
vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>()
  return { ...actual, rename: renameMock, rm: (...args: Parameters<typeof actual.rm>) => removeMock.getMockImplementation() ? removeMock(...args) : actual.rm(...args) }
})
afterEach(() => {
  renameMock.mockReset()
  removeMock.mockReset()
})

describe('installation preset failure recovery', () => {
  it.each([false, true])('preserves originals and concurrent updates when replacement fails: %s', async (concurrent) => {
    const h = await securityFixture()
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    removeMock.mockImplementation(actual.rm)
    const file = path.join(h.workspace, 'pnpm-workspace.yaml')
    const original = await readFile(file, 'utf8')
    const plan = await planInstallSecurityPreset(h.workspace)
    renameMock.mockImplementation(async (source: string, target: string) => {
      if (source.endsWith('.tmp')) {
        if (concurrent) {
          await writeFile(file, `${original}# concurrent edit\n`)
        }
        throw new Error('Injected replacement failure')
      }
      return actual.rename(source, target)
    })
    await expect(applyInstallSecurityPreset(h.workspace, plan)).rejects.toThrow('Injected replacement failure')
    expect(await readFile(file, 'utf8')).toBe(concurrent ? `${original}# concurrent edit\n` : original)
    expect((await readdir(h.workspace)).filter(name => name.includes('.repoctl-deps-'))).toEqual([])
  })

  it('reports committed output and retains its backup when cleanup fails', async () => {
    const h = await securityFixture()
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    renameMock.mockImplementation(actual.rename)
    removeMock.mockImplementation(async (filename: string, options: object) => {
      if (filename.endsWith('.bak')) {
        throw new Error('Injected cleanup failure')
      }
      return actual.rm(filename, options)
    })
    const file = path.join(h.workspace, 'pnpm-workspace.yaml')
    const original = await readFile(file, 'utf8')
    const plan = await planInstallSecurityPreset(h.workspace)
    await expect(applyInstallSecurityPreset(h.workspace, plan)).rejects.toThrow('were applied')
    const backups = (await readdir(h.workspace)).filter(name => name.endsWith('.bak'))
    expect(backups).toHaveLength(1)
    expect(await readFile(path.join(h.workspace, backups[0]!), 'utf8')).toBe(original)
    expect(await readFile(file, 'utf8')).toContain('minimumReleaseAge: 1440')
    expect((await applyInstallSecurityPreset(h.workspace, plan)).status).toBe('unchanged')
  })
})
