import { link } from 'node:fs/promises'
import { applyUpgradePlan, planUpgrade } from '@icebreakers/monorepo'
import path from 'pathe'
import { expect, it } from 'vitest'
import { fixture, sharedInstalledPackage, snapshot } from './fixture'
import { instrument } from './instrument'

it.each(['current', 'legacy'])('validates hard-linked template metadata in %s plans', async (kind) => {
  const h = await fixture()
  const plan = await planUpgrade({ cwd: h.cwd, targets: ['.editorconfig'] })
  const metadata = plan.inputs.find(input => input.area === 'package')!
  expect(metadata).toMatchObject({ path: 'package.json', hash: expect.any(String) })
  if (kind === 'legacy') {
    metadata.area = 'config'
    metadata.path = path.resolve(plan.assetDir, '../package.json')
  }
  expect(await instrument(plan, sharedInstalledPackage)).toBe('applied')
})

it.each(['current', 'legacy'])('rejects changed template metadata even when it matches a target output in %s plans', async (kind) => {
  const h = await fixture()
  const plan = await planUpgrade({ cwd: h.cwd, targets: ['package.json'] })
  if (kind === 'legacy') {
    const metadata = plan.inputs.find(input => input.area === 'package')!
    metadata.area = 'config'
    metadata.path = path.resolve(plan.assetDir, '../package.json')
  }
  const before = await snapshot(h.root)
  const output = await instrument(plan, `
    ${sharedInstalledPackage}
    const readFile = fs.readFile
    fs.readFile = async (filename, ...args) => path.resolve(filename) === path.resolve(plan.assetDir, '../package.json')
      ? Buffer.from(plan.files.find(file => file.path === 'package.json').content, 'base64')
      : readFile(filename, ...args)
  `)
  expect(output).toContain('Upgrade conflicts; regenerate the plan: package:package.json')
  expect(await snapshot(h.root)).toEqual(before)
})

it.each(['../package.json', '/package.json', 'repoctl.config.mjs'])('rejects a package input outside the fixed manifest: %s', async (filename) => {
  const h = await fixture()
  const plan = await planUpgrade({ cwd: h.cwd, targets: ['.editorconfig'] })
  plan.inputs.find(input => input.area === 'package')!.path = filename
  const before = await snapshot(h.root)
  await expect(applyUpgradePlan(h.cwd, plan)).rejects.toThrow('Invalid upgrade input')
  expect(await snapshot(h.root)).toEqual(before)
})

it('retains strict config checks for manifests outside the installed template package', async () => {
  const h = await fixture()
  await h.write('node_modules/another-package/package.json', '{}\n')
  const filename = path.join(h.cwd, 'node_modules/another-package/package.json')
  await link(filename, path.join(h.root, 'shared-package.json'))
  const plan = await planUpgrade({ cwd: h.cwd, targets: ['.editorconfig'] })
  plan.inputs.push({ area: 'config', path: filename, hash: null })
  const before = await snapshot(h.root)
  await expect(applyUpgradePlan(h.cwd, plan)).rejects.toThrow('Linked or non-file upgrade target: package.json')
  expect(await snapshot(h.root)).toEqual(before)
})
