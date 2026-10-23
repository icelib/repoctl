import type { DocsDeploymentReport } from '@/commands/docs/types'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDocsReport, formatDocsSummary } from '@/commands/docs/report'

let root: string
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'repoctl-docs-report-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('documentation step summaries', () => {
  it.each(['deployed', 'skipped'] as const)('writes %s once and returns the same report on repeated finish', async (status) => {
    const filename = path.join(root, 'summary.md')
    const tracker = createDocsReport({ site: 'guide', channel: 'preview', env: { GITHUB_STEP_SUMMARY: filename } })
    await tracker.run('plan', () => undefined)
    tracker.skip('provider', status === 'skipped' ? 'already-completed' : 'not-required')
    const report = await tracker.finish(status)
    expect(await tracker.finish(status)).toBe(report)
    const summary = await readFile(filename, 'utf8')
    expect(summary.match(/## Documentation deployment/g)).toHaveLength(1)
    expect(summary).toContain(`Status: ${status}`)
    expect(summary).toContain('| plan | completed |')
    expect(summary).toContain('| provider | skipped |')
  })

  it('writes the failed stage and accurate saved-receipt recovery guidance', async () => {
    const filename = path.join(root, 'summary.md')
    const tracker = createDocsReport({ site: 'guide', channel: 'stable', env: { GITHUB_STEP_SUMMARY: filename } })
    const failure = new Error('secret response')
    await expect(tracker.run('readiness', () => {
      throw failure
    })).rejects.toBe(failure)
    await tracker.fail(failure, 'verifying', 'known-version')
    const summary = await readFile(filename, 'utf8')
    expect(summary).toContain('Failed stage: `readiness`')
    expect(summary).toContain('Saved phase: `verifying`')
    expect(summary).toContain('Public traffic may already serve that version')
    expect(summary).toContain('previous fully verified deployment')
    expect(summary).not.toContain('secret response')
  })

  it('escapes HTML, Markdown delimiters, pipes and control characters in public report text', () => {
    const unsafe = '<script>`|\n[link](https://unsafe.invalid)\u0000'
    const report: DocsDeploymentReport = {
      schemaVersion: 1,
      site: unsafe,
      channel: 'preview',
      startedAt: unsafe,
      status: 'failed',
      elapsedMs: 0,
      deploymentId: unsafe,
      versionId: unsafe,
      stages: [{ stage: 'readiness', status: 'failed', elapsedMs: 0, reason: unsafe }],
    }
    const summary = formatDocsSummary(report)
    expect(summary).toContain('&lt;script&gt;&#96;&#124;')
    expect(summary).toContain('&#91;link&#93;&#40;https://unsafe.invalid&#41;')
    expect(summary).not.toMatch(/<script>|\[link\]\(|\0/)
    expect(summary.split('\n').filter(line => line.startsWith('| readiness'))).toHaveLength(1)
  })

  it('does not turn a successful deployment into a failure when its summary cannot be written', async () => {
    const tracker = createDocsReport({ site: 'guide', channel: 'preview', env: { GITHUB_STEP_SUMMARY: root } })
    const report = await tracker.finish('deployed', undefined, 'version')
    expect(report).toMatchObject({ status: 'deployed', versionId: 'version', warnings: ['summary-write-failed'] })
  })

  it('preserves the primary failure when summary writing also fails', async () => {
    const tracker = createDocsReport({ site: 'guide', channel: 'stable', env: { GITHUB_STEP_SUMMARY: root } })
    const failure = new Error('private upload response')
    await expect(tracker.run('provider', () => {
      throw failure
    })).rejects.toBe(failure)
    const error = await tracker.fail(failure, 'deploying')
    expect(error.report).toMatchObject({ status: 'failed', failedStage: 'provider', resumablePhase: 'deploying', warnings: ['summary-write-failed'] })
    expect(error.message).toContain('provider')
    expect(JSON.stringify(error)).not.toContain('private upload response')
  })
})
