import type { DocsCloudflareWorkersTarget, DocsDeploymentReport, DocsDeploymentResult, DocsDeploymentStage, DocsDeploymentStageKey, DocsOptions, DocsProviderReceipt, DocsReadinessConfig, DocsScriptDeploymentTarget } from '@icebreakers/monorepo'
import { DocsDeploymentError } from '@icebreakers/monorepo'
import { expectAssignable, expectNotAssignable, expectType } from 'tsd'

expectAssignable<DocsReadinessConfig>({})
expectAssignable<DocsReadinessConfig>({ timeoutMs: 120000, requestTimeoutMs: 10000 })
expectNotAssignable<DocsReadinessConfig>({ timeoutMs: '120000' })
expectNotAssignable<DocsReadinessConfig>({ requestTimeoutMs: false })
expectAssignable<DocsScriptDeploymentTarget>({ deployScript: 'docs:deploy', url: 'https://docs.example.invalid', readiness: {} })
expectAssignable<DocsCloudflareWorkersTarget>({
  provider: 'cloudflare-workers',
  config: 'website/wrangler.jsonc',
  workerName: 'guide',
  accountId: '0123456789abcdef0123456789abcdef',
  url: 'https://docs.example.invalid',
  readiness: { timeoutMs: 30000 },
})
expectAssignable<DocsOptions>({ cwd: '.', site: 'guide', channel: 'preview', json: true })
expectNotAssignable<DocsOptions>({ cwd: '.', site: 'guide', channel: 'preview', json: 'true' })

expectAssignable<DocsDeploymentStageKey>('readiness')
expectNotAssignable<DocsDeploymentStageKey>('http')
expectAssignable<DocsDeploymentStage>({ stage: 'provider', status: 'completed', elapsedMs: 3, operation: 'reconcile' })
expectNotAssignable<DocsDeploymentStage>({ stage: 'provider', status: 'success', elapsedMs: 3 })
expectNotAssignable<DocsDeploymentStage>({ stage: 'provider', status: 'completed', elapsedMs: 3, operation: 'download' })
expectAssignable<DocsProviderReceipt>({ versionId: 'version', url: 'https://docs.example.invalid' })
expectNotAssignable<DocsProviderReceipt>({ url: 'https://docs.example.invalid' })

const report: DocsDeploymentReport = {
  schemaVersion: 1,
  site: 'guide',
  channel: 'stable',
  startedAt: '2026-10-23T00:00:00Z',
  elapsedMs: 20,
  status: 'failed',
  failedStage: 'readiness',
  resumablePhase: 'verifying',
  deploymentId: 'deployment',
  versionId: 'version',
  warnings: ['summary-write-failed'],
  stages: [{ stage: 'readiness', status: 'failed', elapsedMs: 20, reason: 'identity-mismatch' }],
}
expectAssignable<DocsDeploymentReport>(report)
expectNotAssignable<DocsDeploymentReport>({ ...report, resumablePhase: 'building' })
expectNotAssignable<DocsDeploymentReport>({ ...report, warnings: ['arbitrary-message'] })
const error = new DocsDeploymentError(report)
expectAssignable<Error>(error)
expectType<DocsDeploymentReport>(error.report)
declare const result: DocsDeploymentResult
expectType<DocsDeploymentReport | undefined>(result.report)
expectType<'deployed' | 'skipped'>(result.status)
declare const stage: DocsDeploymentStage
expectType<string | undefined>(stage.message)
