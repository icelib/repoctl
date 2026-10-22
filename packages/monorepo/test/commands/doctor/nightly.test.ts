import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { collectDoctorContext } from '../../../src/commands/doctor/context'
import { collectNightlyChecks, nightlyDoctorIds } from '../../../src/commands/doctor/nightly'
import { nightlyWorkflowCondition } from '../../../src/commands/release/lines/workflow'
import { createTempWorkspace } from './helpers'

async function fixture(provider = 'npm', schedule = '') {
  const root = await createTempWorkspace('repoctl-doctor-nightly-')
  await mkdir(path.join(root, '.github/workflows'), { recursive: true })
  await writeFile(path.join(root, 'package.json'), '{"name":"nightly-fixture","private":true}')
  await writeFile(path.join(root, 'repoctl.config.mjs'), `export default ${JSON.stringify({ commands: { release: { nightly: { provider, ...(schedule ? { schedule } : {}) } } } })}`)
  const workflow = path.join(root, '.github/workflows/release.yml')
  await writeFile(workflow, YAML.stringify({
    on: { workflow_dispatch: { inputs: { mode: { options: ['auto', 'nightly'] } } }, ...(schedule ? { schedule: [{ cron: schedule }] } : {}) },
    jobs: { nightly: { if: nightlyWorkflowCondition(schedule || undefined), env: { REPOCTL_NIGHTLY_PROVIDER: provider, REPOCTL_NIGHTLY_SCHEDULE: schedule }, permissions: provider === 'npm' ? { 'contents': 'read', 'id-token': 'write' } : { contents: 'read' } } },
  }))
  const context = await collectDoctorContext(root)
  return { root, workflow, context, check: () => collectNightlyChecks(context, new Set(nightlyDoctorIds)) }
}

describe('nightly doctor checks', () => {
  it.each(['npm', 'pkg-pr-new'])('recognizes matching %s workflow and missing installed CLI', async (provider) => {
    const h = await fixture(provider)
    expect(await h.check()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'nightly-provider', status: 'pass' }),
      expect.objectContaining({ id: 'nightly-schedule', status: 'pass' }),
      expect.objectContaining({ id: 'nightly-cli', status: 'warn' }),
    ]))
  })

  it('detects stale schedule and excess provider permissions', async () => {
    const h = await fixture('pkg-pr-new', '17 19 * * *')
    const workflow = YAML.parse(await readFile(h.workflow, 'utf8'))
    workflow.jobs.nightly.permissions['id-token'] = 'write'
    workflow.on.schedule = []
    await writeFile(h.workflow, YAML.stringify(workflow))
    expect(await h.check()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'nightly-provider', status: 'warn' }),
      expect.objectContaining({ id: 'nightly-schedule', status: 'warn' }),
    ]))
  })

  it('checks installed API capabilities instead of mistaking a legacy version for nightly support', async () => {
    const h = await fixture()
    const installed = path.join(h.root, 'node_modules/repoctl')
    await mkdir(installed, { recursive: true })
    await writeFile(path.join(installed, 'package.json'), '{"name":"repoctl","version":"5.11.0","type":"module","main":"index.mjs"}')
    await writeFile(path.join(installed, 'index.mjs'), 'export function createNightlyPlan() {}\nexport function releaseNightly() {}\n')
    expect(await h.check()).toContainEqual(expect.objectContaining({ id: 'nightly-cli', status: 'pass' }))
  })
})
