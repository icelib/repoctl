import { chmod, lstat, readFile } from 'node:fs/promises'
import process from 'node:process'
import { applyUpgradePlan, planUpgrade } from '@icebreakers/monorepo'
import path from 'pathe'
import { expect, it } from 'vitest'
import { fixture, snapshot } from './fixture'
import { instrument, transactionId } from './instrument'

it.each(['tmp', 'bak'])('preserves an unowned %s collision and the original asset', async (extension) => {
  const h = await fixture()
  await h.write('.editorconfig', 'original\n')
  const plan = await planUpgrade({ cwd: h.cwd, targets: ['.editorconfig'], overwrite: true })
  const collision = `.editorconfig.repoctl-upgrade-${transactionId}.${extension}`
  await h.write(collision, 'another writer\n')
  const before = await snapshot(h.root)
  expect(await instrument(plan, '')).toContain('EEXIST')
  expect(await snapshot(h.root)).toEqual(before)
})

it('does not clean an unowned backup path after a successful file addition', async () => {
  const h = await fixture()
  const plan = await planUpgrade({ cwd: h.cwd, targets: ['.editorconfig'] })
  const collision = `.editorconfig.repoctl-upgrade-${transactionId}.bak`
  await h.write(collision, 'unrelated backup\n')
  expect(await instrument(plan, '')).toBe('applied')
  expect(await readFile(path.join(h.cwd, collision), 'utf8')).toBe('unrelated backup\n')
  expect((await applyUpgradePlan(h.cwd, plan)).status).toBe('unchanged')
})

it('retains changed recovery bytes instead of removing a backup after failed staging', async () => {
  const h = await fixture()
  await h.write('.editorconfig', 'original\n')
  const plan = await planUpgrade({ cwd: h.cwd, targets: ['.editorconfig'], overwrite: true })
  const output = await instrument(plan, `
    const open = fs.open
    fs.open = async (filename, ...args) => {
      if (filename.endsWith('.tmp')) {
        await fs.writeFile(filename.replace(/\\.tmp$/, '.bak'), 'external recovery edit\\n')
        throw new Error('Injected staging failure')
      }
      return open(filename, ...args)
    }
  `)
  expect(output).toContain('recover original files')
  expect(await readFile(path.join(h.cwd, '.editorconfig'), 'utf8')).toBe('original\n')
  expect(await readFile(path.join(h.cwd, `.editorconfig.repoctl-upgrade-${transactionId}.bak`), 'utf8')).toBe('external recovery edit\n')
})

it('preserves a replacement empty directory during failed preparation cleanup', async () => {
  const h = await fixture()
  const plan = await planUpgrade({ cwd: h.cwd, targets: ['.editorconfig'] })
  const baseline = plan.files[0]!.baseline!.path
  const output = await instrument(plan, `
    const open = fs.open
    fs.open = async (filename, ...args) => {
      if (path.resolve(filename) === path.resolve(root, ${JSON.stringify(`${baseline}.repoctl-upgrade-${transactionId}.tmp`)})) {
        const directory = path.dirname(filename)
        await fs.rename(directory, directory + '.retained')
        await fs.mkdir(directory)
        throw new Error('Injected directory replacement')
      }
      return open(filename, ...args)
    }
  `)
  expect(output).toContain('Injected directory replacement')
  expect((await lstat(path.dirname(path.join(h.cwd, baseline)))).isDirectory()).toBe(true)
  await expect(readFile(path.join(h.cwd, '.editorconfig'))).rejects.toThrow()
})

it('still applies plans whose output root does not exist', async () => {
  const h = await fixture()
  const plan = await planUpgrade({ cwd: h.cwd, outDir: 'missing/output', targets: ['.editorconfig'] })
  expect((await applyUpgradePlan(h.cwd, plan)).status).toBe('applied')
  expect(await readFile(path.join(plan.rootDir, '.editorconfig'), 'utf8')).toContain('root = true')
})

it.skipIf(process.platform === 'win32')('retains original permissions even when the process umask would narrow them', async () => {
  const h = await fixture()
  await h.write('.editorconfig', 'original\n')
  await chmod(path.join(h.cwd, '.editorconfig'), 0o660)
  const plan = await planUpgrade({ cwd: h.cwd, targets: ['.editorconfig'], overwrite: true })
  expect(await instrument(plan, 'process.umask(0o077)')).toBe('applied')
  expect((await lstat(path.join(h.cwd, '.editorconfig'))).mode & 0o777).toBe(0o660)
  expect((await lstat(path.join(h.cwd, plan.files[0]!.baseline!.path))).mode & 0o777).toBe(0o600)
})
