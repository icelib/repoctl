import { readdir, readFile } from 'node:fs/promises'
import path from 'pathe'
import { afterEach, expect, it, vi } from 'vitest'
import { applyDoctorFixPlan, planDoctorFix } from '@/commands/doctor'
import { fixture } from './fixture'

const renameMock = vi.hoisted(() => vi.fn())
vi.mock('node:fs/promises', async original => ({ ...await original<typeof import('node:fs/promises')>(), rename: renameMock }))
afterEach(() => renameMock.mockReset())

it('restores original bytes and removes staging files when a script fix replacement fails', async () => {
  const h = await fixture()
  const original = await readFile(path.join(h.root, 'package.json'), 'utf8')
  const plan = await planDoctorFix(h.cwd, { rules: ['root-scripts'] })
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  renameMock.mockImplementation(async (source: string, target: string) => {
    if (source.endsWith('.tmp')) {
      throw new Error('Injected doctor replacement failure')
    }
    return actual.rename(source, target)
  })
  await expect(applyDoctorFixPlan(h.cwd, plan)).rejects.toThrow('Injected doctor replacement failure')
  expect(await readFile(path.join(h.root, 'package.json'), 'utf8')).toBe(original)
  expect((await readdir(h.root)).some(name => name.includes('.repoctl-doctor-'))).toBe(false)
})
