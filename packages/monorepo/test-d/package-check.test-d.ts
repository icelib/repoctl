import type { ConsumerApplicability, ConsumerPackageApplicability, ConsumerRuntimeContext, PackageCheckDiagnostic, PackageCheckManifestOptions, PackageCheckOptions, PackageCheckReport, PackageCheckResult } from '@icebreakers/monorepo'
import { checkPackages } from '@icebreakers/monorepo'
import { expectAssignable, expectNotAssignable, expectType } from 'tsd'

expectType<Promise<PackageCheckReport>>(checkPackages({ cwd: '.', filters: ['@scope/*'], keepTemp: true }))
expectAssignable<PackageCheckOptions>({ cwd: '.', includePrivate: true, buildScript: 'build:release', timeoutMs: 1000 })
expectNotAssignable<PackageCheckOptions>({ cwd: '.', publish: true })
expectNotAssignable<PackageCheckDiagnostic>({ source: 'unknown', code: 'x', severity: 'error', message: '' })
expectAssignable<ConsumerApplicability>({ status: 'not-applicable', host: { os: 'linux', cpu: 'arm64', libc: 'musl' }, reason: 'cpu' })
expectAssignable<ConsumerPackageApplicability>({ name: 'native', version: '1.0.0', status: 'applicable', host: { os: 'win32', cpu: 'x64' } })
expectType<ConsumerApplicability | undefined>({} as PackageCheckResult['applicability'])
expectAssignable<ConsumerRuntimeContext>('vitest')
expectAssignable<ConsumerRuntimeContext>({ kind: 'expected-error', name: 'Error', message: 'Requires the build plugin.' })
expectNotAssignable<ConsumerRuntimeContext>('node')
expectNotAssignable<ConsumerRuntimeContext>({ kind: 'expected-error', name: 'TypeError', message: 'Requires the build plugin.' })
expectNotAssignable<ConsumerRuntimeContext>({ kind: 'expected-error', name: 'Error' })
expectAssignable<PackageCheckManifestOptions>({ runtimeAssets: ['./worker.js'], runtimeContexts: { './vitest/setup': 'vitest', './routes': { kind: 'expected-error', name: 'Error', message: 'Requires the build plugin.' } } })
expectNotAssignable<PackageCheckManifestOptions>({ runtimeContexts: { './setup': { skip: true } } })
