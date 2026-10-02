import { lstat, readFile } from 'node:fs/promises'
import { applyUpgradePlan, planUpgrade } from '@icebreakers/monorepo'
import path from 'pathe'
import { expect, it } from 'vitest'
import { fixture, snapshot } from './fixture'
import { instrument } from './instrument'

it('rejects a second apply until the first finishes rollback, including the final hardlink window', async () => {
  const h = await fixture()
  const plan = await planUpgrade({ cwd: h.cwd, targets: ['.editorconfig'] })
  const before = await snapshot(h.root)
  const baseline = plan.files[0]!.baseline!.path
  const output = await instrument(plan, `
    let entered, release
    const paused = new Promise(resolve => { entered = resolve })
    const resume = new Promise(resolve => { release = resolve })
    const rm = fs.rm
    let injected = false
    fs.rm = async (filename, ...args) => {
      if (!injected && filename.startsWith(path.join(root, ${JSON.stringify(baseline)}) + '.repoctl-upgrade-') && filename.endsWith('.tmp')) {
        injected = true
        entered()
        await resume
        throw new Error('Injected final unlink failure')
      }
      return rm(filename, ...args)
    }
  `, `
    const first = applyUpgradePlan(plan.cwd, plan).catch(error => error.message)
    await paused
    let second
    try { second = await applyUpgradePlan(plan.cwd, plan) } catch (error) { second = error.message }
    release()
    process.stdout.write(JSON.stringify({ first: await first, second }))
  `)
  expect(output).toContain('Injected final unlink failure')
  expect(output).toContain('Operation upgrade is locked')
  expect(output).not.toContain('unchanged')
  expect(await snapshot(h.root)).toEqual(before)
})

it('preserves an existing lock and refuses mutation', async () => {
  const h = await fixture()
  const plan = await planUpgrade({ cwd: h.cwd, targets: ['.editorconfig'] })
  await h.write('.repoctl/upgrade.lock', 'existing writer\n')
  const before = await snapshot(h.root)
  await expect(applyUpgradePlan(h.cwd, plan)).rejects.toThrow('locked')
  expect(await readFile(path.join(h.cwd, '.repoctl/upgrade.lock'), 'utf8')).toBe('existing writer\n')
  expect(await snapshot(h.root)).toEqual(before)
})

it('does not remove a replacement lock directory after releasing its own lock', async () => {
  const h = await fixture()
  const plan = await planUpgrade({ cwd: h.cwd, targets: ['.editorconfig'] })
  const output = await instrument(plan, `
    const unlink = fs.unlink
    fs.unlink = async filename => {
      await unlink(filename)
      if (filename === path.join(root, '.repoctl/upgrade.lock')) {
        await fs.rename(path.join(root, '.repoctl'), path.join(root, '.repoctl.retained'))
        await fs.mkdir(path.join(root, '.repoctl'))
      }
    }
  `)
  expect(output).toBe('applied')
  expect((await lstat(path.join(h.cwd, '.repoctl'))).isDirectory()).toBe(true)
})
