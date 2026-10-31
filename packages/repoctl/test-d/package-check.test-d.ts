import type { ConsumerRuntimeContext, PackageCheckManifestOptions, PackageCheckReport } from 'repoctl'
import { checkPackages } from 'repoctl'
import { expectAssignable, expectNotAssignable, expectType } from 'tsd'

expectType<Promise<PackageCheckReport>>(checkPackages({ cwd: '.', strict: true }))
expectAssignable<ConsumerRuntimeContext>('vitest')
expectAssignable<PackageCheckManifestOptions>({ runtimeContexts: { './guard': { kind: 'expected-error', name: 'Error', message: 'Requires its host.' } } })
expectNotAssignable<ConsumerRuntimeContext>({ kind: 'expected-error', name: 'Error', message: 1 })
expectNotAssignable<PackageCheckManifestOptions>({ runtimeContexts: { './setup': 'unknown' } })
