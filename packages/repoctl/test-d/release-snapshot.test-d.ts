import type { SnapshotIdentity, SnapshotReport } from 'repoctl'
import { createSnapshotPlan, releaseSnapshot } from 'repoctl'
import { expectType } from 'tsd'

const identity: SnapshotIdentity = { kind: 'nightly', commit: 'a'.repeat(40), buildId: 'scheduled-1' }
expectType<Promise<SnapshotReport>>(createSnapshotPlan({ cwd: '.', identity }))
expectType<Promise<SnapshotReport>>(releaseSnapshot({ cwd: '.', identity, dryRun: true }))
