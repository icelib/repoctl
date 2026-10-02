import type { PackageCheckDiagnostic, PackageCheckOptions, PackageCheckReport } from '..'
import { expectAssignable, expectNotAssignable, expectType } from 'tsd'
import { checkPackages } from '..'

expectType<Promise<PackageCheckReport>>(checkPackages({ cwd: '.', filters: ['@scope/*'], keepTemp: true }))
expectAssignable<PackageCheckOptions>({ cwd: '.', includePrivate: true, buildScript: 'build:release', timeoutMs: 1000 })
expectNotAssignable<PackageCheckOptions>({ cwd: '.', publish: true })
expectNotAssignable<PackageCheckDiagnostic>({ source: 'unknown', code: 'x', severity: 'error', message: '' })
