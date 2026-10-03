import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { applyDoctorFixPlan, planDoctorFix, runDoctor } from '@icebreakers/monorepo'
import path from 'pathe'
import { expect, it } from 'vitest'
import { contents, fixture } from './fixture'

it('serializes identical doctor fixes through final verification and cleanup', async () => {
  const h = await fixture()
  const plan = await planDoctorFix(h.cwd, { rules: ['root-scripts'] })
  const outcomes = await Promise.allSettled([applyDoctorFixPlan(h.cwd, plan), applyDoctorFixPlan(h.cwd, plan)])
  expect(outcomes.filter(item => item.status === 'fulfilled')).toHaveLength(1)
  const rejected = outcomes.find(item => item.status === 'rejected') as PromiseRejectedResult
  expect(rejected.reason.message).toContain('locked')
  expect((await runDoctor(h.cwd, { rules: ['root-scripts'] })).summary).toEqual({ pass: 1, warn: 0, fail: 0 })
  expect((await applyDoctorFixPlan(h.cwd, plan)).status).toBe('unchanged')
  expect((await readdir(path.join(h.root, '.repoctl')).catch(() => [])).some(file => file.endsWith('.lock'))).toBe(false)
})

it('preserves an existing operation lock and rejects a second doctor writer before mutation', async () => {
  const h = await fixture()
  const plan = await planDoctorFix(h.cwd, { rules: ['root-scripts'] })
  await mkdir(path.join(h.root, '.repoctl'))
  const lock = path.join(h.root, '.repoctl/doctor-fix.lock')
  await writeFile(lock, 'existing writer\n')
  const before = await contents(h.root)
  await expect(applyDoctorFixPlan(h.cwd, plan)).rejects.toThrow('locked')
  expect(await contents(h.root)).toEqual(before)
  expect(await readFile(lock, 'utf8')).toBe('existing writer\n')
})
