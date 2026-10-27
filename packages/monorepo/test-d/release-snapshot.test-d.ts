import type { SnapshotIdentity, SnapshotOptions, SnapshotPreparationContext, SnapshotPreparationReceipt, SnapshotPreparationResult, SnapshotReport } from '@icebreakers/monorepo'
import { createSnapshotPlan, releaseSnapshot } from '@icebreakers/monorepo'
import { expectAssignable, expectError, expectType } from 'tsd'

const identity: SnapshotIdentity = { kind: 'pr', pullRequest: 12, commit: 'a'.repeat(40), buildId: 'ci-12' }
expectAssignable<SnapshotOptions>({ cwd: '.', identity, dryRun: true })
expectType<Promise<SnapshotReport>>(createSnapshotPlan({ cwd: '.', identity }))
expectType<Promise<SnapshotReport>>(releaseSnapshot({ cwd: '.', identity, publish: true }))
expectError<SnapshotIdentity>({ kind: 'pr', commit: 'a'.repeat(40), buildId: 'ci-12' })
expectError<SnapshotOptions>({ cwd: '.', identity, tag: 'latest' })

expectAssignable<SnapshotOptions>({
  cwd: '.',
  identity,
  referenceGitlinks: ['references/tooling'],
  prepareSource: async (context) => {
    expectType<SnapshotPreparationContext>(context)
    expectType<string>(context.tree)
    expectType<string | undefined>(context.packages[0]?.currentVersion)
    expectError(context.packages.push({}))
    expectError(context.identity.commit = 'other')
    return { files: [{ path: 'packages/a/binding.node', sha256: 'a'.repeat(64) }], metadata: { producer: 'run-1' } }
  },
})
expectAssignable<SnapshotPreparationResult>({ files: [] })
expectAssignable<SnapshotPreparationReceipt>({ commit: identity.commit, tree: 'b'.repeat(40), files: [] })
expectError<SnapshotPreparationResult>({ files: [{ path: 'binding.node' }] })
expectError<SnapshotOptions>({ cwd: '.', identity, prepareSource: 'build' })
