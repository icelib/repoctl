import type { ReleaseCiOptions, ReleaseCiStage, ReleaseCommandConfig, ReleaseRegistryConfig } from '..'
import { expectAssignable, expectError } from 'tsd'

expectAssignable<ReleaseCiStage>('confirm')
expectAssignable<ReleaseCiOptions>({ cwd: '.', stage: 'upload' })
expectAssignable<ReleaseRegistryConfig>({ concurrency: 4, requestTimeoutMs: 10000, visibilityTimeoutMs: 900000 })
expectAssignable<ReleaseCommandConfig>({ registry: { concurrency: 2 } })
expectError<ReleaseCiStage>('publish')
expectError<ReleaseCommandConfig>({ registry: { concurrency: '4' } })
