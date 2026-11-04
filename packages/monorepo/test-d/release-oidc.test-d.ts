import type { releaseCi, ReleaseOidcAuditOptions, ReleaseOidcAuditReport, ReleaseOidcPackageResult } from '@icebreakers/monorepo'
import { auditReleaseOidc } from '@icebreakers/monorepo'
import { expectAssignable, expectNotAssignable, expectType } from 'tsd'

expectType<Promise<ReleaseOidcAuditReport>>(auditReleaseOidc({ cwd: '.', fetch: globalThis.fetch, env: {} }))
expectAssignable<ReleaseOidcAuditOptions>({ cwd: '.' })
expectAssignable<ReleaseOidcAuditOptions>({ cwd: '.', packageNames: ['@scope/pkg'] })
expectNotAssignable<ReleaseOidcAuditOptions>({ cwd: '.', registry: 'https://other.example' })
expectAssignable<Parameters<typeof releaseCi>[0]>({ cwd: '.', mode: 'oidc-audit' })
expectAssignable<Parameters<typeof releaseCi>[0]>({ cwd: '.', mode: 'oidc-audit', packageName: '@scope/pkg' })
declare const result: ReleaseOidcPackageResult
expectType<number | null>(result.status)
expectNotAssignable<ReleaseOidcPackageResult>({ package: 'pkg', token: 'secret' })
