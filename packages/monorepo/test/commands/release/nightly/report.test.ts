import { expect, it } from 'vitest'
import { formatNightlySummary } from '../../../../src/commands/release/nightly/report'
import { reportFixture } from './provider-fixture'

it('only advertises the full installation batch after publication, provider confirmation and consumer verification', () => {
  const report = reportFixture()
  report.status = 'published'
  report.confirmed = true
  expect(formatNightlySummary(report)).not.toContain('| Install |')
  report.consumer = { status: 'failed', packages: [], commands: [], error: 'install failed' }
  expect(formatNightlySummary(report)).not.toContain('| Install |')
  report.consumer.status = 'verified'
  const summary = formatNightlySummary(report)
  expect(summary).toContain('published and consumer verified')
  expect(summary).toContain('pnpm add @scope/a@snapshot-nightly b@snapshot-nightly')
  expect(summary).toContain('latest tags are unchanged')
  report.status = 'failed'
  expect(formatNightlySummary(report)).not.toContain('| Install |')
})

it('distinguishes prepared or skipped runs and escapes untrusted failure text', () => {
  const report = reportFixture()
  report.status = 'prepared'
  expect(formatNightlySummary(report)).toContain('Publication was not requested')
  report.status = 'skipped'
  report.reason = 'Already published'
  expect(formatNightlySummary(report)).toContain('Already published')
  report.status = 'failed'
  report.error = '<script>`unsafe`\n|data'
  const summary = formatNightlySummary(report)
  expect(summary).toContain('&lt;script&gt;&#96;unsafe&#96; &#124;data')
  expect(summary).not.toContain('<script>')
})
