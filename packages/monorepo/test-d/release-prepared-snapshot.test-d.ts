import type { PreparedSnapshot, PreparedSnapshotConsumerReport, PreparedSnapshotPublishReport, SnapshotBuildPlan, SnapshotSource } from '@icebreakers/monorepo'
import { auditReleaseOidc, createSnapshotBuildPlan, getSnapshotWorkflows, prepareSnapshot, publishPreparedSnapshot, verifyPreparedSnapshotConsumer } from '@icebreakers/monorepo'
import { expectError, expectType } from 'tsd'

declare const source: SnapshotSource
declare const plan: SnapshotBuildPlan
declare const report: PreparedSnapshotPublishReport
expectType<Promise<SnapshotBuildPlan>>(createSnapshotBuildPlan({ cwd: '.', source }))
expectType<Promise<PreparedSnapshot>>(prepareSnapshot({ cwd: '.', plan, outputDirectory: '/tmp/output' }))
expectType<Promise<{ build: string, publish: string }>>(getSnapshotWorkflows())
expectType<Promise<PreparedSnapshotPublishReport>>(publishPreparedSnapshot({
  repository: 'acme/repo',
  runId: 1,
  runAttempt: 1,
  outputDirectory: '/tmp/output',
  policy: { workflowPath: '.github/workflows/build.yml', workflowSha256: 'a'.repeat(64), environment: 'pr-snapshot' },
}))
expectType<Promise<PreparedSnapshotConsumerReport>>(verifyPreparedSnapshotConsumer({ report, outputDirectory: '/tmp/consumer' }))
expectError(prepareSnapshot({ cwd: '.', plan, publish: true }))
expectError(publishPreparedSnapshot({ repository: 'acme/repo', runId: 1, runAttempt: 1, outputDirectory: '/tmp/output' }))
expectError(auditReleaseOidc({ cwd: '.', packages: [{ name: 'pkg', version: '1.0.0' }] }))
expectError(auditReleaseOidc({ packages: [{ name: 'pkg' }] }))
