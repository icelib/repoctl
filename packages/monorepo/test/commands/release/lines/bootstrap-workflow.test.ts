import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { applyUpgradePlan, planUpgrade } from '@icebreakers/monorepo'
import { assetsDir } from '@icebreakers/monorepo-templates'
import { expect, it } from 'vitest'
import YAML from 'yaml'
import { renderReleaseWorkflow } from '@/commands/release/lines/workflow'
import { version } from '@/constants'
import { baselineFixture } from '../../upgrade/baseline/fixture'

it('refreshes stale bootstrap tool pins from the installed release engine during upgrade rendering', async () => {
  const source = YAML.parseDocument(await readFile(path.join(assetsDir, '.github/workflows/release.yml'), 'utf8'))
  for (const name of ['bootstrap-publish', 'bootstrap-verify']) {
    source.setIn(['jobs', name, 'env', 'REPOCTL_BOOTSTRAP_TOOL_VERSION'], '0.0.0-old')
  }
  const updated = YAML.parse(renderReleaseWorkflow(source.toString()))
  for (const name of ['bootstrap-publish', 'bootstrap-verify']) {
    expect(updated.jobs[name].env.REPOCTL_BOOTSTRAP_TOOL_VERSION).toBe(version)
  }
})

it('adds bootstrap to an adopted release baseline while retaining local workflow edits', async () => {
  const h = await baselineFixture()
  const filename = '.github/workflows/release.yml'
  const current = await readFile(path.join(assetsDir, filename), 'utf8')
  const previous = YAML.parseDocument(current)
  for (const name of ['bootstrap-prepare', 'bootstrap-publish', 'bootstrap-verify']) {
    previous.deleteIn(['jobs', name])
  }
  for (const input of ['tag', 'verify-run-id']) {
    previous.deleteIn(['on', 'workflow_dispatch', 'inputs', input])
  }
  const modes = previous.getIn(['on', 'workflow_dispatch', 'inputs', 'mode', 'options'], true) as YAML.YAMLSeq
  const bootstrapIndex = modes.items.findIndex(item => YAML.isScalar(item) && item.value === 'bootstrap')
  modes.delete(bootstrapIndex)
  previous.setIn(['jobs', 'release', 'if'], '$' + '{{ github.event_name != \'schedule\' && inputs.mode != \'nightly\' && inputs.mode != \'oidc-audit\' }}')
  const old = previous.toString({ lineWidth: 0 })
  await h.seed(filename, old, old.replace(/^name:.*$/m, 'name: Team Release'))
  const plan = await planUpgrade({ cwd: h.cwd, targets: [filename] })
  expect(plan.status, JSON.stringify(plan.blockers)).toBe('ready')
  const file = plan.files.find(file => file.path === filename)!
  expect(file.status).toBe('modify')
  const upgraded = YAML.parse(Buffer.from(file.content!, 'base64').toString())
  const expected = YAML.parse(current)
  expect(upgraded.name).toBe('Team Release')
  expect(upgraded.on.workflow_dispatch.inputs.mode.options).toContain('bootstrap')
  for (const name of ['bootstrap-prepare', 'bootstrap-publish', 'bootstrap-verify']) {
    expect(upgraded.jobs[name]).toEqual(expected.jobs[name])
  }
  expect(upgraded.jobs.release.if).toContain('inputs.mode != \'bootstrap\'')
  await applyUpgradePlan(h.cwd, plan)
  const again = await planUpgrade({ cwd: h.cwd, targets: [filename] })
  expect(again.files.every(file => file.status === 'identical')).toBe(true)
})
