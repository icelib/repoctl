import { Buffer } from 'node:buffer'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { planUpgrade, prepareMaintenanceUpgrade } from '@icebreakers/monorepo'
import { expect, it } from 'vitest'
import YAML from 'yaml'
import { digest } from './fixture'
import { presetFixture, presetName, presetPolicy, presetTarget } from './preset-fixture'

const { validateMaintenanceArtifact } = await import(new URL('../../../resources/maintenance/validate.mjs', import.meta.url).href)

async function publisher() {
  const h = await presetFixture()
  const report = await prepareMaintenanceUpgrade(h.options)
  expect(report.status, report.errors.join()).toBe('ready')
  const cwd = path.join(h.root, 'publisher')
  h.git(['clone', '-q', '--no-hardlinks', h.cwd, cwd], h.root)
  const input = { cwd, directory: h.options.outputDirectory, expected: h.expected, request: h.request }
  return { ...h, report, input }
}

it('publishes an independently checked preset-only artifact without installed packages or project imports', async () => {
  const h = await publisher()
  const result = await validateMaintenanceArtifact(h.input)
  expect(result.ready).toBe(true)
  expect(await readFile(result.bodyFile, 'utf8')).toContain(`Preset ${presetName}: 1.0.0 → 2.0.0`)
  expect(await readFile(path.join(h.input.cwd, presetTarget), 'utf8')).toContain('fourth = 40')
  await expect(readFile(path.join(h.input.cwd, 'node_modules/repoctl/package.json'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it.each(['policy', 'version', 'source', 'baseline', 'upstream', 'omission', 'report-targets', 'checkout-settings', 'raw-precondition', 'committed-precondition', 'checkout-omission'])('rejects forged %s evidence before obtaining write credentials', async (kind) => {
  const h = await publisher()
  const report = structuredClone(h.report)
  const plan = report.presets!.plan!
  if (kind === 'policy') {
    h.input.expected.presetAssets = []
  }
  else if (kind === 'version') {
    report.presets!.versions[0]!.to = '3.0.0'
  }
  else if (kind === 'source') {
    plan.files[0]!.source.path = 'assets/other.mjs'
  }
  else if (kind === 'baseline') {
    plan.files[0]!.baseline!.path = '.repoctl/baselines/presets/arbitrary.json'
  }
  else if (kind === 'upstream') {
    const record = JSON.parse(Buffer.from(plan.files[0]!.baseline!.content!, 'base64').toString())
    record.upstream.hash = 'a'.repeat(64)
    plan.files[0]!.baseline!.content = Buffer.from(JSON.stringify(record)).toString('base64')
    plan.files[0]!.baseline!.afterHash = digest(Buffer.from(JSON.stringify(record)))
  }
  else if (kind === 'omission') {
    report.files = report.files.filter(file => file.path !== h.baselinePath)
  }
  else if (kind === 'checkout-settings') {
    report.presets!.checkout!.autocrlf = 'execute' as never
  }
  else if (kind === 'checkout-omission') {
    report.presets!.checkout!.before.pop()
  }
  else if (kind === 'raw-precondition' || kind === 'committed-precondition') {
    const evidence = report.presets!.checkout!.before.find(file => file.path === presetTarget)!
    const content = Buffer.from('forged before bytes\n')
    evidence.content = content.toString('base64')
    if (kind === 'committed-precondition') {
      plan.files[0]!.beforeHash = digest(content)
    }
  }
  else {
    plan.targets = ['scripts/arbitrary.mjs']
    plan.files[0]!.path = 'scripts/arbitrary.mjs'
  }
  await writeFile(path.join(h.options.outputDirectory, 'report.json'), JSON.stringify(report))
  await expect(validateMaintenanceArtifact(h.input)).rejects.toThrow('Maintenance publication blocked')
  expect(h.git(['status', '--porcelain'], h.input.cwd)).toBe('')
})

it('exports exact preset triples and embeds the independent validator into the trusted workflow', async () => {
  const h = await presetFixture()
  const workflow = YAML.parse(h.workflow)
  const script = workflow.jobs.propose.steps.find((step: { id?: string }) => step.id === 'verify').with.script
  expect(script).toContain(`presetAssets: ${JSON.stringify(presetPolicy)}`)
  expect(script).toContain('function validatePresetMaintenance')
  expect(script).not.toContain('from \'./presets.mjs\'')
  expect(script).not.toContain('__PRESET_ASSETS__')
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
  expect(() => new AsyncFunction(script)).not.toThrow()
})

it.each(['asset', 'root-baseline'])('rejects reclassifying existing preset %s ownership as root-provider authority', async (kind) => {
  const h = await publisher()
  const report = structuredClone(h.report)
  delete report.presets
  report.versions = { status: 'changed', from: '0.1.0', to: h.version, reason: 'forged-root-upgrade' }
  report.plan = await planUpgrade({ cwd: h.cwd, targets: ['.editorconfig'], mergeTargets: false })
  report.files = [kind === 'asset' ? report.files.find(file => file.path === presetTarget)! : { ...report.files.find(file => file.path === h.baselinePath)!, path: h.baselinePath.replace('/presets/', '/root/') }]
  h.input.expected.targets = [presetTarget]
  await writeFile(path.join(h.options.outputDirectory, 'report.json'), JSON.stringify(report))
  await expect(validateMaintenanceArtifact(h.input)).rejects.toThrow('unapproved')
  expect(h.git(['status', '--porcelain'], h.input.cwd)).toBe('')
})
