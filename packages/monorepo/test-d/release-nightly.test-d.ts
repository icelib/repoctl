import type { MonorepoConfig, NightlyOptions, NightlyProvider, NightlyReport, ReleaseNightlyConfig } from '@icebreakers/monorepo'
import { createNightlyPlan, releaseNightly } from '@icebreakers/monorepo'
import { expectAssignable, expectNotAssignable, expectType } from 'tsd'

expectAssignable<NightlyProvider>('npm')
expectAssignable<NightlyProvider>('pkg-pr-new')
expectAssignable<ReleaseNightlyConfig>({ provider: 'npm', schedule: '17 19 * * *' })
expectAssignable<ReleaseNightlyConfig>({ qualityTimeoutMs: 3_600_000 })
expectAssignable<MonorepoConfig>({ commands: { release: { nightly: { qualityTimeoutMs: 3_600_000 } } } })
expectAssignable<MonorepoConfig>({ commands: { release: { nightly: { provider: 'pkg-pr-new' } } } })
expectAssignable<NightlyOptions>({ cwd: '.', dryRun: true, config: { nightly: { provider: 'npm' } } })
expectType<Promise<NightlyReport>>(createNightlyPlan({ cwd: '.' }))
expectType<Promise<NightlyReport>>(releaseNightly({ cwd: '.', publish: true }))
expectNotAssignable<ReleaseNightlyConfig>({ provider: 'other' })
expectNotAssignable<ReleaseNightlyConfig>({ qualityTimeoutMs: '3600000' })
expectNotAssignable<NightlyOptions>({ cwd: '.', registry: 'https://example.invalid' })

expectAssignable<NightlyOptions>({ cwd: '.', referenceGitlinks: ['references/tooling'], prepareSource: async context => ({ files: [], metadata: { source: context.tree } }) })
expectNotAssignable<ReleaseNightlyConfig>({ prepareSource: async () => ({ files: [] }) })
