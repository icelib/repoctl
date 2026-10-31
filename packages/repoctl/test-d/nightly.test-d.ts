import type { NightlyOptions, NightlyProvider, NightlyReport, ReleaseNightlyConfig } from 'repoctl'
import { createNightlyPlan, releaseNightly } from 'repoctl'
import { expectAssignable, expectNotAssignable, expectType } from 'tsd'

expectAssignable<NightlyProvider>('npm')
expectAssignable<ReleaseNightlyConfig>({ provider: 'pkg-pr-new' })
expectAssignable<ReleaseNightlyConfig>({ qualityTimeoutMs: 3_600_000 })
expectAssignable<NightlyOptions>({ cwd: '.', config: { nightly: { qualityTimeoutMs: 3_600_000 } } })
expectAssignable<NightlyOptions>({ cwd: '.', publish: true })
expectType<Promise<NightlyReport>>(createNightlyPlan({ cwd: '.' }))
expectType<Promise<NightlyReport>>(releaseNightly({ cwd: '.', dryRun: true }))
expectNotAssignable<ReleaseNightlyConfig>({ provider: 'npm-token' })
expectNotAssignable<ReleaseNightlyConfig>({ qualityTimeoutMs: '3600000' })
