import type { DoctorCheck, DoctorReport } from '@icebreakers/monorepo'
import { describe, expect, it } from 'vitest'
import { createDoctorReportOutput, createInteractiveDoctorReportOutput, hasDoctorBlockingIssues } from '@/cli/commands/doctor/render'

const check: DoctorCheck = { id: 'template-instance-drift', title: 'Managed template path', status: 'warn', detail: 'modified', fix: 'Review repo template upgrade apps/docs' }

function report(checks: DoctorCheck[]): DoctorReport {
  return { cwd: '/work/repo/apps/docs', workspaceDir: '/work/repo', packageCount: 2, checks, summary: { pass: 0, warn: checks.length, fail: 0 } }
}

describe('doctor diagnostic rendering', () => {
  it('groups the same reason while retaining every path, occurrence and original JSON record', () => {
    const value = report([
      { ...check, path: 'apps/docs/a.md' },
      { ...check, path: 'apps/docs/b.md' },
      { ...check, path: 'apps/docs/a.md' },
    ])
    const before = structuredClone(value)
    const text = createDoctorReportOutput(value, {})
    expect(text).toContain('[WARN] [template-instance-drift] Managed template path (3 checks)')
    expect(text.match(/ {2}path: apps\/docs\/a.md/g)).toHaveLength(2)
    expect(text).toContain('  path: apps/docs/b.md')
    expect(text.match(/ {2}fix:/g)).toHaveLength(1)
    expect(text).toContain('summary: 0 pass, 3 warn, 0 fail')
    const markdown = createDoctorReportOutput(value, { markdown: true })
    expect(markdown.match(/Fix:/g)).toHaveLength(1)
    expect(markdown).toContain('(3 checks)')
    expect(markdown).toContain('apps/docs/a\\.md')
    expect(markdown).toContain('apps/docs/b\\.md')
    expect(createInteractiveDoctorReportOutput(value, {})).toContain('(3 checks)')
    expect(JSON.parse(createDoctorReportOutput(value, { json: true }))).toEqual(value)
    expect(value).toEqual(before)
  })

  it.each([
    { id: 'root-asset-drift' },
    { title: 'Other managed files' },
    { status: 'fail' as const },
    { detail: 'deleted' },
    { fix: 'Review another template' },
    { field: 'scripts.build' },
    { suppression: { id: check.id, state: 'active' as const, reason: 'Reviewed customization' } },
  ])('keeps differing diagnostic identity separate: %j', (difference) => {
    const value = report([{ ...check, path: 'a' }, { ...check, ...difference, path: 'b' }])
    const text = createDoctorReportOutput(value, {})
    expect(text).not.toContain('(2 checks)')
    expect(text.match(/ {2}path:/g)).toHaveLength(2)
    expect(text.match(/ {2}fix:/g)).toHaveLength(2)
  })

  it('keeps pathless findings distinct and shows manifest fields without inventing paths', () => {
    const value = report([check, { ...check, path: 'package.json', field: 'version' }, check])
    const text = createDoctorReportOutput(value, {})
    expect(text.match(/\[WARN\]/g)).toHaveLength(3)
    expect(text.match(/ {2}path:/g)).toHaveLength(1)
    expect(text).toContain('  field: version')
    const markdown = createDoctorReportOutput(value, { markdown: true })
    expect(markdown).toContain('  - Field: version')
    expect(markdown).not.toContain('Path: undefined')
  })

  it('escapes Markdown syntax, HTML, newlines and Windows paths as literal diagnostic text', () => {
    const value = report([{ ...check, path: 'C:\\docs\\[draft]|`file`.md\r\n<script>', title: '**unsafe**', detail: '<img src=x> & [click](https://example.invalid) ~~obsolete~~', fix: 'Use `a|b`' }])
    const markdown = createDoctorReportOutput(value, { markdown: true })
    expect(markdown).toContain('C:\\\\docs\\\\\\[draft\\]\\|\\`file\\`\\.md<br>&lt;script&gt;')
    expect(markdown).toContain('\\*\\*unsafe\\*\\*')
    expect(markdown).toContain('&lt;img src=x&gt; &amp; \\[click\\]\\(https://example\\.invalid\\)')
    expect(markdown).toContain('Use \\`a\\|b\\`')
    expect(markdown).toContain('\\~\\~obsolete\\~\\~')
    expect(markdown).not.toContain('<script>')
    expect(createDoctorReportOutput(value, {})).toContain('C:\\docs\\[draft]|`file`.md')
  })

  it('redacts all rendered locations and preserves complete machine-readable records', () => {
    const value = report([{ ...check, path: '/work/repo/apps/docs/a.md', detail: 'modified /work/repo/apps/docs/a.md', fix: 'Review /work/repo' }])
    for (const options of [{}, { markdown: true }, { json: true }]) {
      const output = createDoctorReportOutput(value, { ...options, redact: true })
      expect(output).not.toContain('/work/repo')
    }
    expect(createDoctorReportOutput(value, { redact: true })).toContain('path: <cwd>/a.md')
    expect(createDoctorReportOutput(value, { markdown: true, redact: true })).toContain('&lt;cwd&gt;/a\\.md')
    const json = JSON.parse(createDoctorReportOutput(value, { json: true, redact: true }))
    expect(json.checks).toHaveLength(1)
    expect(json.checks[0].path).toBe('<cwd>/a.md')
  })

  it('preserves effective failures and active/expired suppression metadata across grouping', () => {
    const active = { id: check.id, state: 'active' as const, reason: 'Reviewed', expires: '2099-12-31' }
    const expired = { ...active, state: 'expired' as const, expires: '2000-01-01' }
    const value: DoctorReport = {
      ...report([
        { ...check, path: 'a', suppression: active },
        { ...check, path: 'b', suppression: active },
        { ...check, path: 'c', suppression: expired },
        { ...check, path: 'd', status: 'fail' },
      ]),
      summary: { pass: 0, warn: 1, fail: 1 },
      rawSummary: { pass: 0, warn: 3, fail: 1 },
      suppressions: [{ ...active, matched: 2 }, { ...expired, matched: 1 }],
    }
    const text = createDoctorReportOutput(value, {})
    expect(text).toContain('(2 checks)')
    expect(text).toContain('summary: 0 pass, 1 warn, 1 fail')
    expect(text).toContain('suppression: active')
    expect(text).toContain('suppression: expired')
    expect(createDoctorReportOutput(value, { markdown: true })).toContain('matched: 2')
    expect(hasDoctorBlockingIssues(value, {})).toBe(true)
    expect(hasDoctorBlockingIssues({ ...value, summary: { pass: 0, warn: 1, fail: 0 } }, {})).toBe(false)
    expect(hasDoctorBlockingIssues({ ...value, summary: { pass: 0, warn: 1, fail: 0 } }, { strict: true })).toBe(true)
  })
})
