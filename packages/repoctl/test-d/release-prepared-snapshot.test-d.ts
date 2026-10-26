import type { PreparedSnapshot, PreparedSnapshotConsumerReport, PreparedSnapshotPublishOptions, PreparedSnapshotPublishReport, SnapshotBuildPlan, SnapshotBuildPlanOptions } from 'repoctl'
import { auditReleaseOidc, createSnapshotBuildPlan, getSnapshotWorkflows, prepareSnapshot, publishPreparedSnapshot, verifyPreparedSnapshotConsumer } from 'repoctl'
import { expectType } from 'tsd'

declare const plan: SnapshotBuildPlan
declare const freeze: SnapshotBuildPlanOptions
declare const publish: PreparedSnapshotPublishOptions
declare const report: PreparedSnapshotPublishReport
expectType<Promise<SnapshotBuildPlan>>(createSnapshotBuildPlan(freeze))
expectType<Promise<PreparedSnapshot>>(prepareSnapshot({ cwd: '.', plan, outputDirectory: '/tmp/output' }))
expectType<Promise<PreparedSnapshotPublishReport>>(publishPreparedSnapshot(publish))
expectType<Promise<PreparedSnapshotConsumerReport>>(verifyPreparedSnapshotConsumer({ report, outputDirectory: '/tmp/output' }))
expectType<Promise<{ build: string, publish: string }>>(getSnapshotWorkflows())
void auditReleaseOidc({ packages: [{ name: 'pkg', version: '1.0.0' }] })
