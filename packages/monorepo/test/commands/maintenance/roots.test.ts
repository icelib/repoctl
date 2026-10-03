import { mkdir, realpath, symlink } from 'node:fs/promises'
import path from 'node:path'
import { prepareMaintenanceUpgrade } from '@icebreakers/monorepo'
import { expect, it } from 'vitest'
import { fixture } from './fixture'

it('prepares the real checkout when invoked through a directory alias', async () => {
  const h = await fixture()
  const alias = path.join(h.root, 'checkout-alias')
  await symlink(h.cwd, alias, 'junction')
  const report = await prepareMaintenanceUpgrade({ ...h.options, cwd: alias })
  expect(report.status, report.errors.join()).toBe('ready')
  expect(await realpath(report.plan!.rootDir)).toBe(await realpath(h.cwd))
  expect(report.files.map(file => file.path)).toContain('.editorconfig')
  expect(h.calls.length).toBeGreaterThan(0)
})

it('rejects a nested checkout directory before planning or running validation', async () => {
  const h = await fixture()
  const nested = path.join(h.cwd, 'nested')
  await mkdir(nested)
  const report = await prepareMaintenanceUpgrade({ ...h.options, cwd: nested })
  expect(report.status).toBe('blocked')
  expect(report.errors.join()).toContain('clean committed repository root')
  expect(report.plan).toBeNull()
  expect(h.calls).toEqual([])
})

it('rejects an artifact directory alias that resolves inside the checkout', async () => {
  const h = await fixture()
  const output = path.join(h.cwd, 'reports')
  const alias = path.join(h.root, 'artifact-alias')
  await mkdir(output)
  await symlink(output, alias, 'junction')
  await expect(prepareMaintenanceUpgrade({ ...h.options, outputDirectory: alias })).rejects.toThrow('outside the source checkout')
  expect(h.calls).toEqual([])
})
