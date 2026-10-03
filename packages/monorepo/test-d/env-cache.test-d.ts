import type { EnvCacheConfig, EnvCacheReport, MonorepoConfig, WorkspacePackageManifest } from '@icebreakers/monorepo'
import { checkEnvironmentCache, formatEnvironmentCache } from '@icebreakers/monorepo'
import { expectAssignable, expectError, expectType } from 'tsd'

expectType<Promise<EnvCacheReport>>(checkEnvironmentCache('/workspace', { tasks: ['build'], frameworkInference: false }))
expectType<string>(formatEnvironmentCache({} as EnvCacheReport, true))
expectAssignable<EnvCacheConfig>({ tasks: ['build'], suppressions: [{ rule: 'env-dynamic-access', reason: 'Validated at runtime', package: '@app/*' }] })
expectAssignable<MonorepoConfig>({ commands: { env: { include: ['src/**'], frameworkInference: false } } })
expectAssignable<WorkspacePackageManifest>({ scripts: { build: 'tsc' } })
expectError(checkEnvironmentCache('/workspace', { tasks: 'build' }))
expectError(checkEnvironmentCache('/workspace', { frameworkInference: 'false' }))
