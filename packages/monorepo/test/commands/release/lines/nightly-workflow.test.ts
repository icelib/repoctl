import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { applyUpgradePlan, planUpgrade } from '@icebreakers/monorepo'
import { assetsDir, scaffoldWorkspace } from '@icebreakers/monorepo-templates'
import path from 'pathe'
import { expect, it } from 'vitest'
import YAML from 'yaml'
import { nightlyWorkflowCondition, renderReleaseWorkflow } from '@/commands/release/lines/workflow'
import { baselinePath, parseBaseline } from '@/commands/upgrade/baseline/record'
import { fixture } from '../../upgrade/plan/fixture'

const filename = '.github/workflows/release.yml'
const source = () => readFile(path.join(assetsDir, filename), 'utf8')

it('accepts the fresh scaffold baseline as the exact root-upgrade upstream', async () => {
  const h = await fixture()
  const targetDir = path.join(h.root, 'generated')
  await scaffoldWorkspace({ targetDir })
  const recordPath = baselinePath(filename)
  const baseline = parseBaseline(await readFile(path.join(targetDir, recordPath)), recordPath)
  expect(Buffer.from(baseline.upstream.content, 'base64').toString()).toBe(await source())
})

it('defaults to manual npm nightly and renders an explicit provider and cron', async () => {
  const content = await source()
  const original = YAML.parse(content)
  const defaults = YAML.parse(renderReleaseWorkflow(content))
  expect(defaults.on.schedule).toBeUndefined()
  expect(defaults.jobs.nightly.if).toBe(nightlyWorkflowCondition())
  expect(defaults.jobs.nightly.permissions).toEqual({ 'contents': 'read', 'id-token': 'write' })
  const configured = renderReleaseWorkflow(content, { nightly: { provider: 'pkg-pr-new', schedule: '5 4 * * 1' } })
  const workflow = YAML.parse(configured)
  expect(workflow.on.schedule).toEqual([{ cron: '5 4 * * 1' }])
  expect(workflow.jobs.nightly.if).toBe(nightlyWorkflowCondition('5 4 * * 1'))
  expect(workflow.jobs.nightly.env).toEqual({ REPOCTL_NIGHTLY_PROVIDER: 'pkg-pr-new', REPOCTL_NIGHTLY_SCHEDULE: '5 4 * * 1' })
  expect(workflow.jobs.nightly.permissions).toEqual({ contents: 'read' })
  for (const rendered of [defaults, workflow]) {
    expect(rendered.jobs.docs).toEqual(original.jobs.docs)
    expect(rendered.jobs.release.outputs).toEqual(original.jobs.release.outputs)
  }
  expect(renderReleaseWorkflow(configured, { nightly: { provider: 'pkg-pr-new', schedule: '5 4 * * 1' } })).toBe(configured)
})

it('changes or removes only the cron owned by nightly, retaining other scheduled jobs', async () => {
  const initial = renderReleaseWorkflow(await source(), { nightly: { schedule: '5 4 * * 1' } })
  const document = YAML.parseDocument(initial)
  const schedules = document.getIn(['on', 'schedule'], true) as YAML.YAMLSeq
  schedules.add({ cron: '30 8 * * 2' })
  document.setIn(['jobs', 'maintenance'], { if: 'github.event.schedule == \'30 8 * * 2\'', steps: [{ run: 'echo maintenance' }] })
  const changed = renderReleaseWorkflow(document.toString(), { nightly: { schedule: '7 9 * * *' } })
  expect(YAML.parse(changed).on.schedule).toEqual([{ cron: '30 8 * * 2' }, { cron: '7 9 * * *' }])
  const disabled = YAML.parse(renderReleaseWorkflow(changed))
  expect(disabled.on.schedule).toEqual([{ cron: '30 8 * * 2' }])
  expect(disabled.jobs.maintenance).toEqual(document.toJS().jobs.maintenance)
  expect(disabled.jobs.nightly.if).toBe(nightlyWorkflowCondition())
})

it('upgrades an adopted workflow while preserving local edits and rejects stale configuration', async () => {
  const h = await fixture()
  await applyUpgradePlan(h.cwd, await planUpgrade({ cwd: h.cwd, targets: [filename] }))
  const installed = await readFile(path.join(h.cwd, filename), 'utf8')
  const original = YAML.parse(installed)
  await h.write(filename, installed.replace('name: Release', 'name: Team Release'))
  await h.write('repoctl.config.mjs', 'export default {commands:{release:{nightly:{provider:\'pkg-pr-new\',schedule:\'5 4 * * 1\'}}}}')
  const plan = await planUpgrade({ cwd: h.cwd, targets: [filename] })
  const file = plan.files.find(file => file.path === filename)!
  expect(file.status).toBe('modify')
  const content = YAML.parse(Buffer.from(file.content!, 'base64').toString())
  expect(content.name).toBe('Team Release')
  expect(content.jobs.nightly.permissions).toEqual({ contents: 'read' })
  expect(content.jobs.docs).toEqual(original.jobs.docs)
  expect(content.jobs.release.outputs).toEqual(original.jobs.release.outputs)
  await applyUpgradePlan(h.cwd, plan)
  const again = await planUpgrade({ cwd: h.cwd, targets: [filename] })
  expect(again.files.every(file => file.status === 'identical')).toBe(true)
  await h.write('repoctl.config.mjs', 'export default {}')
  await expect(applyUpgradePlan(h.cwd, again)).rejects.toThrow('Upgrade conflicts')
  const disabled = await planUpgrade({ cwd: h.cwd, targets: [filename] })
  await applyUpgradePlan(h.cwd, disabled)
  const final = YAML.parse(await readFile(path.join(h.cwd, filename), 'utf8'))
  expect(final.name).toBe('Team Release')
  expect(final.on.schedule).toBeUndefined()
  expect(final.jobs.docs).toEqual(original.jobs.docs)
  expect(final.jobs.release.outputs).toEqual(original.jobs.release.outputs)
})

it.each([false, true])('does not adopt an existing workflow without a baseline (managed=%s)', async (managed) => {
  const h = await fixture()
  await h.write('repoctl.config.mjs', 'export default {commands:{release:{nightly:{schedule:\'5 4 * * 1\'}}}}')
  const content = `${managed ? '# repoctl-managed: release/v2\n' : ''}name: Team Release\njobs: {}\n`
  await h.write(filename, content)
  const plan = await planUpgrade({ cwd: h.cwd, targets: [filename], yes: true })
  expect(plan.files.find(file => file.path === filename)).toMatchObject(managed ? { status: 'conflict', reason: 'baseline-missing' } : { status: 'skip', reason: 'custom-release-protected' })
  expect(await readFile(path.join(h.cwd, filename), 'utf8')).toBe(content)
})
