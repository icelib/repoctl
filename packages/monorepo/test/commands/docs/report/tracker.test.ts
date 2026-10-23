import { describe, expect, it } from 'vitest'
import { DocsDiagnosticError } from '@/commands/docs/diagnostics'
import { DocsReadinessError } from '@/commands/docs/readiness'
import { createDocsReport, DocsDeploymentError } from '@/commands/docs/report'
import { duration } from '@/commands/docs/report/safety'

function fixture(env: NodeJS.ProcessEnv = {}) {
  let now = 100
  const tracker = createDocsReport({ site: 'guide', channel: 'stable', env }, {
    now: () => now,
    timestamp: () => new Date('2026-10-23T01:02:03.000Z'),
  })
  return { tracker, advance: (amount: number) => {
    now += amount
  } }
}

describe('documentation deployment reports', () => {
  it('keeps actionable repoctl diagnostics without copying a modified error message or cause', async () => {
    const { tracker } = fixture()
    const failure = new DocsDiagnosticError('credentials-missing')
    failure.message = 'secret-token Authorization: Bearer private'
    Object.assign(failure, { cause: { body: 'private provider body' } })
    await expect(tracker.run('preflight', () => {
      throw failure
    })).rejects.toBe(failure)
    const error = await tracker.fail(failure)
    expect(error.message).toContain('CLOUDFLARE_API_TOKEN is required')
    expect(error.report.stages[1]).toMatchObject({ reason: 'credentials-missing', message: 'CLOUDFLARE_API_TOKEN is required to verify documentation deployments.' })
    expect(JSON.stringify(error)).not.toMatch(/secret-token|Bearer|private/)
  })

  it('records synchronous and asynchronous work in canonical order with attempt durations', async () => {
    const { tracker, advance } = fixture()
    tracker.setIdentity({ deploymentId: 'deployment-123' })
    expect(await tracker.run('plan', () => {
      advance(3)
      return 42
    })).toBe(42)
    await tracker.run('build', async () => {
      advance(7)
    })
    tracker.skip('install', 'resumed-verification')
    const metadata: { operation: 'upload' | 'reconcile' } = { operation: 'upload' }
    await tracker.run('provider', () => {
      metadata.operation = 'reconcile'
      advance(11)
    }, metadata)
    const report = await tracker.finish('deployed', undefined, 'version-456')
    expect(report).toMatchObject({
      schemaVersion: 1,
      site: 'guide',
      channel: 'stable',
      status: 'deployed',
      startedAt: '2026-10-23T01:02:03.000Z',
      elapsedMs: 21,
      deploymentId: 'deployment-123',
      versionId: 'version-456',
    })
    expect(report.stages).toEqual([
      { stage: 'plan', status: 'completed', elapsedMs: 3 },
      { stage: 'preflight', status: 'skipped', elapsedMs: 0, reason: 'not-run' },
      { stage: 'install', status: 'skipped', elapsedMs: 0, reason: 'resumed-verification' },
      { stage: 'build', status: 'completed', elapsedMs: 7 },
      { stage: 'provider', status: 'completed', elapsedMs: 11, operation: 'reconcile' },
      { stage: 'readiness', status: 'skipped', elapsedMs: 0, reason: 'not-run' },
      { stage: 'finalize', status: 'skipped', elapsedMs: 0, reason: 'not-run' },
    ])
  })

  it.each([[4, 1], [0, Number.NaN], [Number.POSITIVE_INFINITY, 5]])('clamps invalid durations %s → %s', (start, end) => {
    expect(duration(start, end)).toBe(0)
  })

  it('does not retain arbitrary errors, causes, bodies or unrecognized skip reasons', async () => {
    const { tracker, advance } = fixture()
    const unsafe = new Error('Authorization: Bearer super-secret', { cause: { body: '<token>super-secret</token>' } })
    tracker.skip('install', 'https://user:super-secret@example.invalid')
    await expect(tracker.run('provider', () => {
      advance(9)
      throw unsafe
    }, { operation: 'upload' })).rejects.toBe(unsafe)
    const error = await tracker.fail(unsafe, 'deploying')
    expect(error).toBeInstanceOf(DocsDeploymentError)
    expect(error).not.toHaveProperty('cause')
    expect(error.report).toMatchObject({ status: 'failed', failedStage: 'provider', resumablePhase: 'deploying' })
    expect(error.report.stages[2]).toMatchObject({ reason: 'not-run' })
    expect(error.report.stages[4]).toEqual({ stage: 'provider', status: 'failed', elapsedMs: 9, reason: 'provider-failed', operation: 'upload' })
    expect(`${error.message}${JSON.stringify(error)}`).not.toMatch(/super-secret|Authorization|<token>|example\.invalid/)
  })

  it('preserves only a readiness classification and the known recovery phase', async () => {
    const { tracker } = fixture()
    const failure = new DocsReadinessError('identity-mismatch', 5)
    await expect(tracker.run('readiness', () => {
      throw failure
    })).rejects.toBe(failure)
    const error = await tracker.fail(failure, 'verifying', 'saved-version')
    expect(error.report).toMatchObject({ failedStage: 'readiness', resumablePhase: 'verifying', versionId: 'saved-version' })
    expect(error.report.stages[5]).toMatchObject({ reason: 'identity-mismatch' })
    expect(error.message).not.toContain(failure.message)
  })

  it('masks known credentials in identifiers without exposing unrelated environment fields', async () => {
    const { tracker } = fixture({ CLOUDFLARE_API_TOKEN: 'secret-value', OTHER_CONFIG: 'not-serialized' })
    tracker.setIdentity({ deploymentId: 'deployment-secret-value' })
    const report = await tracker.finish('deployed', undefined, 'secret-value')
    expect(report).toMatchObject({ deploymentId: '[redacted]', versionId: '[redacted]' })
    expect(JSON.stringify(report)).not.toMatch(/secret-value|not-serialized|CLOUDFLARE_API_TOKEN/)
  })

  it('reports planning failure safely before identity is available', async () => {
    const { tracker } = fixture()
    const error = await tracker.fail(new Error('private configuration'))
    expect(error.report).toMatchObject({ failedStage: 'plan', status: 'failed' })
    expect(error.report.stages[0]).toMatchObject({ reason: 'plan-failed' })
    expect(error.message).toContain('Run repo docs plan with the same inputs')
    expect(error.report.stages[0]?.message).toContain('configuration, source selection and release evidence')
    expect(error.report).not.toHaveProperty('deploymentId')
    expect(JSON.stringify(error)).not.toContain('private configuration')
  })
})
