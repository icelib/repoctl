import type { ReleaseCiOptions, ReleaseCiStage, ReleaseCommandConfig, ReleaseNotesConfig, ReleaseRegistryConfig } from 'repoctl'
import { expectAssignable, expectNotAssignable } from 'tsd'

expectAssignable<ReleaseCiStage>('confirm')
expectAssignable<ReleaseCiOptions>({ cwd: '.', stage: 'upload' })
expectAssignable<ReleaseRegistryConfig>({ concurrency: 4, requestTimeoutMs: 10000, visibilityTimeoutMs: 900000 })
expectAssignable<ReleaseCommandConfig>({ registry: { concurrency: 2 } })
expectAssignable<ReleaseNotesConfig>({ mode: 'compact' })
expectAssignable<ReleaseCommandConfig>({ notes: { mode: 'compact' } })
expectNotAssignable<ReleaseCiStage>('publish')
expectNotAssignable<ReleaseCommandConfig>({ registry: { concurrency: '4' } })
expectNotAssignable<ReleaseNotesConfig>({ mode: 'brief' })
