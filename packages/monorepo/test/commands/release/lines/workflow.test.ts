import { Buffer } from 'node:buffer'
import { applyUpgradePlan, planUpgrade } from '@icebreakers/monorepo'
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
