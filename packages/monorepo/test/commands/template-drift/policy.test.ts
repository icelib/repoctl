import { expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist
import { checkTemplateDrift, formatTemplateDriftReport, hasTemplateDriftIssues, runDoctor } from '../../../dist/index.mjs'
import { fixture, write } from './fixtures'

it('reuses configured doctor suppressions with exact scope, reasons, expiry and raw evidence', async (t) => {
  const f = await fixture(t)
  await write(f.targetDir, 'README.md', 'Local business readme')
  const suppression = { id: 'template-instance-drift', path: `${f.target}/README.md`, reason: 'Business-owned documentation', expires: '9999-12-31' }
  await write(f.cwd, 'repoctl.config.mjs', `export default ${JSON.stringify({ commands: { doctor: { suppressions: [suppression] } } })}`)
  const report = await checkTemplateDrift(f.cwd, { sourceDir: f.sourceDir })
  expect(report.rawSummary.warn).toBe(1)
  expect(report.summary.warn).toBe(0)
  expect(report.suppressions).toEqual([{ ...suppression, state: 'active', matched: 1 }])
  expect(report.owners[0]?.local).toBe('drifted')
  expect(hasTemplateDriftIssues(report, true)).toBe(false)
  const markdown = formatTemplateDriftReport(report)
  expect(markdown).toContain('Business-owned documentation')
  expect(markdown).toContain('Retained version')
  expect(markdown).toContain('Review local modifications')
  const doctor = await runDoctor(f.cwd, { rules: ['template-instance-drift'] })
  expect(doctor.rawSummary?.warn).toBe(1)
  expect(doctor.summary.warn).toBe(0)
  expect(doctor.checks.every(check => check.id === 'template-instance-drift')).toBe(true)
})

it('keeps expired and unmatched suppressions visible without suppressing unrelated paths', async (t) => {
  const f = await fixture(t)
  await write(f.targetDir, 'README.md', 'Local business readme')
  await write(f.targetDir, 'src/index.ts', 'Local business code')
  const report = await checkTemplateDrift(f.cwd, { sourceDir: f.sourceDir, suppressions: [
    { id: 'template-instance-drift', path: `${f.target}/README.md`, reason: 'Expired decision', expires: '2000-01-01' },
    { id: 'template-instance-drift', path: 'packages/other/README.md', reason: 'Other instance' },
  ] })
  expect(report.summary.warn).toBe(2)
  expect(report.suppressions.map(item => [item.state, item.matched])).toEqual([['expired', 1], ['active', 0]])
  expect(hasTemplateDriftIssues(report, true)).toBe(true)
})

it('rejects invalid options and suppression policies instead of silently weakening checks', async (t) => {
  const f = await fixture(t)
  await expect(checkTemplateDrift(f.cwd, { sourceDir: f.sourceDir, remote: true })).rejects.toThrow('either')
  await expect(checkTemplateDrift(f.cwd, { suppressions: [{ id: 'template-instance-drift', reason: '' }] })).rejects.toThrow('nonempty reason')
  await write(f.cwd, 'repoctl.config.mjs', 'export default {commands:{doctor:{suppressions:null}}}')
  await expect(checkTemplateDrift(f.cwd)).rejects.toThrow('cannot be null')
})
