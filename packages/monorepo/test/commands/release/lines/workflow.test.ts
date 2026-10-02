import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { applyUpgradePlan, planUpgrade } from '@icebreakers/monorepo'
import path from 'pathe'
import { expect, it } from 'vitest'
import YAML from 'yaml'
import { fixture, snapshot } from '../../upgrade/plan/fixture'
import { branches } from './fixture'

it('previews and synchronizes managed workflow branches from the same mapping, with stale-plan checks', async () => {
  const h = await fixture()
  await h.write('repoctl.config.mjs', `export default ${JSON.stringify({ commands: { release: { branches } } })}`)
  const before = await snapshot(h.root)
  const plan = await planUpgrade({ cwd: h.cwd, targets: ['.github/workflows/release.yml'] })
  expect(plan.status, JSON.stringify(plan.blockers)).toBe('ready')
  const file = plan.files.find(file => file.path === '.github/workflows/release.yml')!
  expect(file.reason).toBe('release-branch-mapping')
  const workflow = YAML.parse(Buffer.from(file.content!, 'base64').toString())
  expect(workflow.on.push.branches).toEqual(['master', '1.x', 'preview/1.x'])
  expect(await snapshot(h.root)).toEqual(before)
  await applyUpgradePlan(h.cwd, plan)
  const again = await planUpgrade({ cwd: h.cwd, targets: ['.github/workflows/release.yml'] })
  expect(again.files.every(file => ['identical', 'skip'].includes(file.status))).toBe(true)
  await h.write('repoctl.config.mjs', 'export default {commands:{release:{branches:{stable:"trunk"}}}}')
  await expect(applyUpgradePlan(h.cwd, again)).rejects.toThrow('Upgrade conflicts')
})

it('protects a custom workflow when a branch mapping is configured', async () => {
  const h = await fixture()
  await h.write('repoctl.config.mjs', `export default ${JSON.stringify({ commands: { release: { branches } } })}`)
  await h.write('.github/workflows/release.yml', 'name: team release\njobs: {}\n')
  const plan = await planUpgrade({ cwd: h.cwd, targets: ['.github/workflows/release.yml'] })
  expect(plan.files[0]).toMatchObject({ status: 'skip', reason: 'custom-release-protected' })
})

it('merges a changed branch mapping against the rendered baseline while retaining local workflow edits', async () => {
  const h = await fixture()
  const filename = '.github/workflows/release.yml'
  await h.write('repoctl.config.mjs', `export default ${JSON.stringify({ commands: { release: { branches } } })}`)
  const initial = await planUpgrade({ cwd: h.cwd, targets: [filename] })
  await applyUpgradePlan(h.cwd, initial)
  const original = await readFile(path.join(h.cwd, filename), 'utf8')
  await h.write(filename, original.replace(/^name:.*$/m, 'name: Team release'))
  await h.write('repoctl.config.mjs', `export default ${JSON.stringify({ commands: { release: { branches: { ...branches, stable: 'trunk' } } } })}`)
  const next = await planUpgrade({ cwd: h.cwd, targets: [filename] })
  expect(next.status, JSON.stringify(next.blockers)).toBe('ready')
  const workflow = next.files.find(file => file.path === filename)!
  const content = YAML.parse(Buffer.from(workflow.content!, 'base64').toString())
  expect(content.name).toBe('Team release')
  expect(content.on.push.branches).toEqual(['trunk', '1.x', 'preview/1.x'])
  const baseline = JSON.parse(Buffer.from(workflow.baseline!.content!, 'base64').toString())
  const upstream = YAML.parse(Buffer.from(baseline.upstream.content, 'base64').toString())
  expect(upstream.name).not.toBe('Team release')
  expect(upstream.on.push.branches).toEqual(['trunk', '1.x', 'preview/1.x'])
  await applyUpgradePlan(h.cwd, next)
  const again = await planUpgrade({ cwd: h.cwd, targets: [filename] })
  expect(again.files.every(file => ['identical', 'skip'].includes(file.status))).toBe(true)
})
