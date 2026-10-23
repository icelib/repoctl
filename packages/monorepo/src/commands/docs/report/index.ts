import type { DocsDeploymentPlan, DocsDeploymentReport, DocsDeploymentStage, DocsDeploymentStageKey, DocsOptions } from '../types'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { duration, identityRedactor, safeFailureMessage, safeFailureReason, safeSkipReason, stageOrder } from './safety'
import { writeDocsSummary } from './summary'

export { formatDocsSummary } from './summary'

export class DocsDeploymentError extends Error {
  readonly report: DocsDeploymentReport

  constructor(report: DocsDeploymentReport) {
    const stage = stageOrder.find(item => item === report.failedStage) ?? 'plan'
    const reason = report.stages.find(item => item.stage === stage && item.status === 'failed')?.reason
    const message = reason ? safeFailureMessage(reason) : undefined
    super(`Documentation deployment failed during ${stage}. ${message ?? 'Inspect the deployment report and retry the same deployment when applicable.'}`)
    this.name = 'DocsDeploymentError'
    this.report = report
  }
}

interface ReportClock {
  now: () => number
  timestamp: () => Date
}

/** Track work without retaining exceptions, credentials, provider bodies or configuration. */
export function createDocsReport(options: Pick<DocsOptions, 'site' | 'channel' | 'env'>, clock: ReportClock = { now: () => performance.now(), timestamp: () => new Date() }) {
  const env = options.env ?? process.env
  const redact = identityRedactor(env)
  const start = clock.now()
  const startedAt = clock.timestamp().toISOString()
  const stages = new Map<DocsDeploymentStageKey, DocsDeploymentStage>()
  let failedStage: DocsDeploymentStageKey | undefined
  let deploymentId: string | undefined
  let finished: DocsDeploymentReport | undefined

  async function finish(status: DocsDeploymentReport['status'], resumablePhase?: DocsDeploymentReport['resumablePhase'], versionId?: string) {
    if (finished) {
      return finished
    }
    finished = {
      schemaVersion: 1,
      site: redact(options.site),
      channel: options.channel === 'stable' ? 'stable' : 'preview',
      startedAt,
      elapsedMs: duration(start, clock.now()),
      status,
      stages: stageOrder.map(stage => stages.get(stage) ?? { stage, status: 'skipped', elapsedMs: 0, reason: 'not-run' }),
      ...(failedStage ? { failedStage } : {}),
      ...(resumablePhase ? { resumablePhase } : {}),
      ...(deploymentId ? { deploymentId } : {}),
      ...(versionId ? { versionId: redact(versionId) } : {}),
    }
    await writeDocsSummary(finished, env['GITHUB_STEP_SUMMARY'])
    return finished
  }

  return {
    async run<T>(stage: DocsDeploymentStageKey, fn: () => T | Promise<T>, metadata: { operation?: 'upload' | 'reconcile' } = {}): Promise<T> {
      const before = clock.now()
      try {
        const result = await fn()
        stages.set(stage, { stage, status: 'completed', elapsedMs: duration(before, clock.now()), ...(metadata.operation ? { operation: metadata.operation } : {}) })
        return result
      }
      catch (error) {
        failedStage ??= stage
        const reason = safeFailureReason(error, stage)
        const message = safeFailureMessage(reason)
        stages.set(stage, { stage, status: 'failed', elapsedMs: duration(before, clock.now()), reason, ...(message ? { message } : {}), ...(metadata.operation ? { operation: metadata.operation } : {}) })
        throw error
      }
    },
    skip(stage: DocsDeploymentStageKey, reason: string) {
      stages.set(stage, { stage, status: 'skipped', elapsedMs: 0, reason: safeSkipReason(reason) })
    },
    setIdentity(plan: Pick<DocsDeploymentPlan, 'deploymentId'>) {
      deploymentId = redact(plan.deploymentId)
    },
    finish,
    async fail(error: unknown, resumablePhase?: DocsDeploymentReport['resumablePhase'], versionId?: string) {
      if (!failedStage) {
        failedStage = 'plan'
        const reason = safeFailureReason(error, 'plan')
        const message = safeFailureMessage(reason)
        stages.set('plan', { stage: 'plan', status: 'failed', elapsedMs: duration(start, clock.now()), reason, ...(message ? { message } : {}) })
      }
      return new DocsDeploymentError(await finish('failed', resumablePhase, versionId))
    },
  }
}
