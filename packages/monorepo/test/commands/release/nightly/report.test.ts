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

it.each(['npm', 'pkg-pr-new'] as const)('explains confirmed %s publication after consumer failure without advertising installation', (provider) => {
  const report = reportFixture(provider)
  report.status = 'failed'
  report.confirmed = true
  report.consumer = { status: 'failed', packages: [], commands: [], error: 'install failed' }
  const summary = formatNightlySummary(report)
  expect(summary).toContain('Status: failed')
  expect(summary).toContain('Publication was confirmed, but consumer verification failed')
  expect(summary).toContain('This run remains failed')
  expect(summary).toContain('Confirmed build: `123-1`')
  expect(summary).toContain('nightly-report.json, consumer-report.json and the retained package artifacts')
  expect(summary).not.toContain('published and consumer verified')
  expect(summary).not.toContain('| Install |')
  expect(summary).not.toContain('pnpm add')
  if (provider === 'npm') {
    expect(summary).toContain('scheduled run for the same commit may skip')
    expect(summary).toContain('without repeating consumer verification')
    expect(summary).toContain('if a new nightly publication is intended')
    expect(summary).toContain('Release workflow manually with mode=nightly and dry-run=false')
    expect(summary).toContain('publishes snapshots with a new build identity')
  }
  else {
    expect(summary).not.toContain('scheduled run')
    expect(summary).not.toContain('mode=nightly')
    expect(summary).not.toContain('new build identity')
  }
})

it.each([
  ['unconfirmed publication', 'failed', false, 'failed'],
  ['unknown publication', 'failed', undefined, 'failed'],
  ['missing consumer result', 'failed', true, undefined],
  ['verified consumer', 'failed', true, 'verified'],
  ['planned run', 'planned', true, 'failed'],
  ['skipped run', 'skipped', true, 'failed'],
  ['prepared run', 'prepared', true, 'failed'],
  ['published run', 'published', true, 'failed'],
] as const)('does not suggest a confirmed consumer failure for %s', (_name, status, confirmed, consumerStatus) => {
  const report = reportFixture()
  report.status = status
  if (confirmed !== undefined) {
    report.confirmed = confirmed
  }
  if (consumerStatus) {
    report.consumer = { status: consumerStatus, packages: [], commands: [] }
  }
  const summary = formatNightlySummary(report)
  expect(summary).not.toContain('Publication was confirmed, but consumer verification failed')
  expect(summary).not.toContain('Confirmed build:')
  expect(summary).not.toContain('mode=nightly')
})

it('escapes the confirmed build identity in consumer failure diagnostics', () => {
  const report = reportFixture()
  report.status = 'failed'
  report.confirmed = true
  report.consumer = { status: 'failed', packages: [], commands: [] }
  report.buildId = '<build>`unsafe`\n|data&'
  const summary = formatNightlySummary(report)
  expect(summary).toContain('Confirmed build: `&lt;build&gt;&#96;unsafe&#96; &#124;data&amp;`')
  expect(summary).not.toContain('<build>')
})
