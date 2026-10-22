import type { releaseCi, ReleaseOidcAuditOptions, ReleaseOidcAuditReport, ReleaseOidcPackageResult } from '@icebreakers/monorepo'
import { auditReleaseOidc } from '@icebreakers/monorepo'
import { expectAssignable, expectNotAssignable, expectType } from 'tsd'

expectType<Promise<ReleaseOidcAuditReport>>(auditReleaseOidc({ cwd: '.', fetch: globalThis.fetch, env: {} }))
expectAssignable<ReleaseOidcAuditOptions>({ cwd: '.' })
expectNotAssignable<ReleaseOidcAuditOptions>({ cwd: '.', registry: 'https://other.example' })
expectAssignable<Parameters<typeof releaseCi>[0]>({ cwd: '.', mode: 'oidc-audit' })
declare const result: ReleaseOidcPackageResult
expectType<number | null>(result.status)
expectNotAssignable<ReleaseOidcPackageResult>({ package: 'pkg', token: 'secret' })
