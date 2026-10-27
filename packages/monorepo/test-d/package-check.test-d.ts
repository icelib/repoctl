import type { ConsumerApplicability, ConsumerPackageApplicability, PackageCheckDiagnostic, PackageCheckOptions, PackageCheckReport, PackageCheckResult } from '@icebreakers/monorepo'
import { checkPackages } from '@icebreakers/monorepo'
import { expectAssignable, expectNotAssignable, expectType } from 'tsd'

expectType<Promise<PackageCheckReport>>(checkPackages({ cwd: '.', filters: ['@scope/*'], keepTemp: true }))
expectAssignable<PackageCheckOptions>({ cwd: '.', includePrivate: true, buildScript: 'build:release', timeoutMs: 1000 })
expectNotAssignable<PackageCheckOptions>({ cwd: '.', publish: true })
expectNotAssignable<PackageCheckDiagnostic>({ source: 'unknown', code: 'x', severity: 'error', message: '' })
expectAssignable<ConsumerApplicability>({ status: 'not-applicable', host: { os: 'linux', cpu: 'arm64', libc: 'musl' }, reason: 'cpu' })
expectAssignable<ConsumerPackageApplicability>({ name: 'native', version: '1.0.0', status: 'applicable', host: { os: 'win32', cpu: 'x64' } })
expectType<ConsumerApplicability | undefined>({} as PackageCheckResult['applicability'])
