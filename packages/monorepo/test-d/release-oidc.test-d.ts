import type { releaseCi, ReleaseOidcAuditOptions, ReleaseOidcAuditReport, ReleaseOidcPackageResult } from '..'
import { expectAssignable, expectNotAssignable, expectType } from 'tsd'
import { auditReleaseOidc } from '..'

expectType<Promise<ReleaseOidcAuditReport>>(auditReleaseOidc({ cwd: '.', fetch: globalThis.fetch, env: {} }))
expectAssignable<ReleaseOidcAuditOptions>({ cwd: '.' })
expectNotAssignable<ReleaseOidcAuditOptions>({ cwd: '.', registry: 'https://other.example' })
expectAssignable<Parameters<typeof releaseCi>[0]>({ cwd: '.', mode: 'oidc-audit' })
declare const result: ReleaseOidcPackageResult
expectType<number | null>(result.status)
expectNotAssignable<ReleaseOidcPackageResult>({ package: 'pkg', token: 'secret' })
