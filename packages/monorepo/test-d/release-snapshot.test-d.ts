import type { SnapshotIdentity, SnapshotOptions, SnapshotReport } from '..'
import { expectAssignable, expectError, expectType } from 'tsd'
import { createSnapshotPlan, releaseSnapshot } from '..'

const identity: SnapshotIdentity = { kind: 'pr', pullRequest: 12, commit: 'a'.repeat(40), buildId: 'ci-12' }
expectAssignable<SnapshotOptions>({ cwd: '.', identity, dryRun: true })
expectType<Promise<SnapshotReport>>(createSnapshotPlan({ cwd: '.', identity }))
expectType<Promise<SnapshotReport>>(releaseSnapshot({ cwd: '.', identity, publish: true }))
expectError<SnapshotIdentity>({ kind: 'pr', commit: 'a'.repeat(40), buildId: 'ci-12' })
expectError<SnapshotOptions>({ cwd: '.', identity, tag: 'latest' })
