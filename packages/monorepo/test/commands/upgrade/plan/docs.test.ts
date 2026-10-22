import { readFile } from 'node:fs/promises'
import { applyUpgradePlan, planUpgrade } from '@icebreakers/monorepo'
import path from 'pathe'
import { expect, it } from 'vitest'
import { fixture } from './fixture'

const preview = '.github/workflows/repoctl-docs.yml'
const reusable = '.github/workflows/repoctl-docs-deploy.yml'
const docs = { sites: { guide: { packages: ['a'], buildScript: 'docs:build', patchPaths: ['docs/**'], preview: { deployScript: 'docs:preview' }, stable: { deployScript: 'docs:stable' } } } }

it('adds no automatic documentation workflow until a site is explicitly configured', async () => {
  const h = await fixture()
  const plan = await planUpgrade({ cwd: h.cwd, targets: [preview, reusable] })
  expect(plan.files.find(file => file.path === preview)).toMatchObject({ status: 'skip', reason: 'docs-not-configured' })
  expect(plan.files.find(file => file.path === reusable)).toMatchObject({ status: 'add' })
})

it('enables the managed workflow without overwriting an existing custom deployment', async () => {
  const h = await fixture()
  await h.write('repoctl.config.mjs', `export default ${JSON.stringify({ commands: { docs } })}\n`)
  const enabled = await planUpgrade({ cwd: h.cwd, targets: [preview, reusable] })
  expect(enabled.files.find(file => file.path === preview)).toMatchObject({ status: 'add' })
  await h.write(preview, 'name: Custom documentation\non: [push]\njobs: {}\n')
  await h.write(reusable, 'name: Custom deployment\non: [workflow_call]\njobs: {}\n')
  const protectedPlan = await planUpgrade({ cwd: h.cwd, targets: [preview, reusable], overwrite: true })
  for (const filename of [preview, reusable]) {
    expect(protectedPlan.files.find(file => file.path === filename)).toMatchObject({ status: 'skip', reason: 'custom-docs-protected' })
  }
})

it('does not copy an invocation workspace documentation opt-in into an unconfigured output', async () => {
  const h = await fixture()
  await h.write('repoctl.config.mjs', `export default ${JSON.stringify({ commands: { docs } })}\n`)
  const outDir = path.join(h.cwd, 'consumer')
  const plan = await planUpgrade({ cwd: h.cwd, outDir, targets: [preview, reusable] })
  expect(plan.status).toBe('ready')
  expect(plan.files.find(file => file.path === preview)).toMatchObject({ status: 'skip', reason: 'docs-not-configured' })
  await applyUpgradePlan(h.cwd, plan)
  await expect(readFile(path.join(outDir, preview))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readFile(path.join(outDir, reusable), 'utf8')).toContain('workflow_call:')
})

it('uses and freezes the output workspace documentation configuration', async () => {
  const h = await fixture()
  await h.write('consumer/repoctl.config.mjs', `export default ${JSON.stringify({ commands: { docs } })}\n`)
  const outDir = path.join(h.cwd, 'consumer')
  const plan = await planUpgrade({ cwd: h.cwd, outDir, targets: [preview] })
  expect(plan.files.find(file => file.path === preview)).toMatchObject({ status: 'add' })
  expect(plan.inputs).toContainEqual(expect.objectContaining({ area: 'config', path: path.join(outDir, 'repoctl.config.mjs') }))
  await h.write('consumer/repoctl.config.mjs', 'export default {}\n')
  await expect(applyUpgradePlan(h.cwd, plan)).rejects.toThrow('Upgrade conflicts')
  await expect(readFile(path.join(outDir, preview))).rejects.toMatchObject({ code: 'ENOENT' })
})
