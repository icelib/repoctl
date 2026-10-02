import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import path from 'node:path'
import { expect, it, vi } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist
import { applyTemplateUpgradePlan, listTemplateInstances, planTemplateUpgrade, recoverTemplateUpgrade } from '../../../../dist/index.mjs'
import { contents, originalCode, upgradeFixture, write } from './fixtures'

it.for(['file', 'registry'])('restores files and metadata when a %s write fails', async (failure, t) => {
  const f = await upgradeFixture(t)
  await write(f.nextSource, 'templates/tsdown/README.md', 'Updated readme\n')
  await write(f.nextSource, 'templates/tsdown/src/index.ts', originalCode.replace('first = 1', 'first = 2'))
  await write(f.nextSource, 'templates/tsdown/added/nested/file.ts', 'export const added = true\n')
  const filename = path.join(f.targetDir, 'README.md')
  await fs.chmod(filename, 0o600)
  await fs.utimes(filename, 1_000_000_000, 1_000_000_000)
  const originalMode = (await fs.stat(filename)).mode & 0o777
  const before = await contents(f.cwd)
  const plan = await planTemplateUpgrade(f.options)
  const rename = fs.rename.bind(fs)
  let failed = false
  const spy = vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
    if (!failed && String(to).replaceAll('\\', '/').endsWith(failure === 'registry' ? '/.repoctl/template-instances.json' : `/${f.target}/src/index.ts`)) {
      failed = true
      throw new Error('Injected write failure')
    }
    return rename(from, to)
  })
  try {
    await expect(applyTemplateUpgradePlan(plan)).rejects.toThrow('Injected write failure')
  }
  finally {
    spy.mockRestore()
  }
  expect(failed).toBe(true)
  expect(await contents(f.cwd)).toEqual(before)
  const restored = await fs.stat(filename)
  expect(restored.mode & 0o777).toBe(originalMode)
  expect(restored.mtimeMs).toBe(1_000_000_000_000)
  await expect(fs.stat(path.join(f.targetDir, 'added'))).rejects.toThrow()
  expect((await recoverTemplateUpgrade(f.cwd, f.target)).status).toBe('no-pending-upgrade')
})

it('retains concurrent business edits and supports explicit conflict-aware recovery', async (t) => {
  const f = await upgradeFixture(t)
  await write(f.nextSource, 'templates/tsdown/README.md', 'Updated readme\n')
  const upstream = originalCode.replace('first = 1', 'first = 2')
  await write(f.nextSource, 'templates/tsdown/src/index.ts', upstream)
  await write(f.targetDir, 'unrelated.txt', 'unrelated-secret-must-not-enter-journal\n')
  const beforeInstance = (await listTemplateInstances(f.cwd))[0]!.instance
  const plan = await planTemplateUpgrade(f.options)
  const rename = fs.rename.bind(fs)
  const spy = vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
    if (String(to).replaceAll('\\', '/').endsWith('/.repoctl/template-instances.json')) {
      await write(f.targetDir, 'src/index.ts', 'Concurrent business edit\n')
      throw new Error('Registry commit failed')
    }
    return rename(from, to)
  })
  try {
    await expect(applyTemplateUpgradePlan(plan)).rejects.toThrow(`.repoctl/template-upgrades/${beforeInstance.id}.json`)
  }
  finally {
    spy.mockRestore()
  }
  expect(await fs.readFile(path.join(f.targetDir, 'src/index.ts'), 'utf8')).toBe('Concurrent business edit\n')
  expect((await listTemplateInstances(f.cwd))[0]!.instance).toEqual(beforeInstance)
  const journal = path.join(f.cwd, '.repoctl/template-upgrades', `${beforeInstance.id}.json`)
  const raw = await fs.readFile(journal, 'utf8')
  expect(raw).not.toContain(Buffer.from('unrelated-secret-must-not-enter-journal\n').toString('base64'))
  const beforePreview = await contents(f.cwd)
  expect((await recoverTemplateUpgrade(f.cwd, f.target)).status).toBe('conflict')
  expect(await contents(f.cwd)).toEqual(beforePreview)
  await expect(recoverTemplateUpgrade(f.cwd, f.target, true)).rejects.toThrow('concurrent changes')
  await expect(planTemplateUpgrade(f.options)).rejects.toThrow('pending template upgrade')
  await write(f.targetDir, 'src/index.ts', upstream)
  const recovered = await recoverTemplateUpgrade(f.cwd, f.target, true)
  expect(recovered.status).toBe('recovered')
  expect(recovered.files.every(file => file.state === 'before')).toBe(true)
  expect(await fs.readFile(path.join(f.targetDir, 'src/index.ts'), 'utf8')).toBe(originalCode)
  expect((await listTemplateInstances(f.cwd))[0]!.instance).toEqual(beforeInstance)
  await expect(fs.stat(journal)).rejects.toThrow()
  expect((await planTemplateUpgrade(f.options)).action).toBe('upgrade')
})

it('distinguishes a committed upgrade with failed journal cleanup and can recover it', async (t) => {
  const f = await upgradeFixture(t)
  await write(f.nextSource, 'templates/tsdown/src/index.ts', originalCode.replace('first = 1', 'first = 2'))
  const plan = await planTemplateUpgrade(f.options)
  const unlink = fs.unlink.bind(fs)
  const spy = vi.spyOn(fs, 'unlink').mockImplementation(async (filename) => {
    if (String(filename).replaceAll('\\', '/').includes('/template-upgrades/') && String(filename).endsWith('.json')) {
      throw new Error('Cleanup failed')
    }
    return unlink(filename)
  })
  try {
    await expect(applyTemplateUpgradePlan(plan)).rejects.toThrow('upgrade was applied')
  }
  finally {
    spy.mockRestore()
  }
  expect((await listTemplateInstances(f.cwd))[0]!.instance.source.version).toBe('2.0.0')
  expect((await recoverTemplateUpgrade(f.cwd, f.target)).registryStatus).toBe('after')
  await recoverTemplateUpgrade(f.cwd, f.target, true)
  expect((await listTemplateInstances(f.cwd))[0]!.instance.source.version).toBe('1.2.3')
  expect(await fs.readFile(path.join(f.targetDir, 'src/index.ts'), 'utf8')).toBe(originalCode)
})

it('preserves an existing registry temporary-file collision while rolling the upgrade back', async (t) => {
  const f = await upgradeFixture(t)
  await write(f.nextSource, 'templates/tsdown/src/index.ts', originalCode.replace('first = 1', 'first = 2'))
  const plan = await planTemplateUpgrade(f.options)
  const before = await contents(f.cwd)
  const open = fs.open.bind(fs)
  let collision: string | undefined
  const spy = vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
    const filename = String(args[0])
    if (!collision && filename.replaceAll('\\', '/').includes('/.repoctl/template-instances.json.') && filename.endsWith('.tmp')) {
      collision = filename
      await fs.writeFile(filename, 'Existing file owned by another operation\n', { flag: 'wx' })
    }
    return open(...args)
  })
  try {
    await expect(applyTemplateUpgradePlan(plan)).rejects.toThrow('EEXIST')
  }
  finally {
    spy.mockRestore()
  }
  expect(collision).toBeDefined()
  expect(await fs.readFile(collision!, 'utf8')).toBe('Existing file owned by another operation\n')
  await fs.unlink(collision!)
  expect(await contents(f.cwd)).toEqual(before)
})
