import { link } from 'node:fs/promises'
import { applyUpgradePlan, planUpgrade } from '@icebreakers/monorepo'
import path from 'pathe'
import { expect, it } from 'vitest'
import { fixture, sharedInstalledPackage, snapshot } from './fixture'
import { instrument } from './instrument'

it('plans and applies read-only package assets with multiple hard links', async () => {
  const h = await fixture()
  const plan = await planUpgrade({ cwd: h.cwd, targets: ['.editorconfig'] })
  const output = await instrument(plan, sharedInstalledPackage, `
    const { planUpgrade } = await import(entry)
    const reviewed = await planUpgrade({ cwd: root, targets: ['.editorconfig'] })
    if (reviewed.status !== 'ready') throw new Error(JSON.stringify(reviewed.blockers))
    await applyUpgradePlan(root, reviewed)
  `)
  expect(output).toBe('applied')
})

it('rejects changed package asset bytes before applying a reviewed plan', async () => {
  const h = await fixture()
  const plan = await planUpgrade({ cwd: h.cwd, targets: ['.editorconfig'] })
  const before = await snapshot(h.root)
  const output = await instrument(plan, `
    ${sharedInstalledPackage}
    const readFile = fs.readFile
    fs.readFile = async (filename, ...args) => {
      const content = await readFile(filename, ...args)
      return path.resolve(filename) === path.resolve(plan.assetDir, '.editorconfig')
        ? Buffer.from('concurrent package-store edit\\n')
        : content
    }
  `)
  expect(output).toContain('Upgrade conflicts; regenerate the plan: asset:.editorconfig')
  expect(await snapshot(h.root)).toEqual(before)
})

it.each(['.editorconfig', '../package.json'])('still rejects symbolic links in installed package input %s before writing', async (filename) => {
  const h = await fixture()
  const plan = await planUpgrade({ cwd: h.cwd, targets: ['.editorconfig'] })
  const before = await snapshot(h.root)
  const output = await instrument(plan, `
    ${sharedInstalledPackage}
    const originalLstat = fs.lstat
    fs.lstat = async (filename, options) => {
      const info = await originalLstat(filename, options)
      if (path.resolve(filename) === path.resolve(plan.assetDir, ${JSON.stringify(filename)})) {
        info.isSymbolicLink = () => true
      }
      return info
    }
  `)
  expect(output).toContain(`Linked or non-file upgrade target: ${path.basename(filename)}`)
  expect(await snapshot(h.root)).toEqual(before)
})

it.each(['planning', 'application'])('rejects hard-linked workspace configuration during %s', async (phase) => {
  const h = await fixture()
  await h.write('repoctl.config.mjs', 'export default {}\n')
  const plan = await planUpgrade({ cwd: h.cwd, targets: ['.editorconfig'] })
  await link(path.join(h.cwd, 'repoctl.config.mjs'), path.join(h.root, 'shared-config.mjs'))
  const before = await snapshot(h.root)
  if (phase === 'planning') {
    const blocked = await planUpgrade({ cwd: h.cwd, targets: ['.editorconfig'] })
    expect(blocked.status).toBe('blocked')
    expect(blocked.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ detail: 'Linked or non-file upgrade target: repoctl.config.mjs' }),
    ]))
  }
  else {
    await expect(applyUpgradePlan(h.cwd, plan)).rejects.toThrow('Linked or non-file upgrade target: repoctl.config.mjs')
  }
  expect(await snapshot(h.root)).toEqual(before)
})
