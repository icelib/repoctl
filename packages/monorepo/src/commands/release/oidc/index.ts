import type { ReleaseOidcAuditOptions, ReleaseOidcAuditReport } from '../../../core/oidc/types'
import type { ReleaseCiOptions } from '../types'
import process from 'node:process'
import { exchangePackage } from '../../../core/oidc/exchange'
import { npmRegistry, record, requestIdentity } from '../../../core/oidc/identity'
import { clearWorkspaceCache, getWorkspaceData } from '../../../core/workspace'
import { ReleaseCommandError } from '../errors'
import { getReleaseEnv } from '../shared'

export type { ReleaseOidcAuditOptions, ReleaseOidcAuditReport, ReleaseOidcPackageResult } from '../../../core/oidc/types'

/** 逐包核验官方 npm 的短时凭据交换；不发布、不执行 hooks，也不保存凭据。 */
export async function auditReleaseOidc(options: ReleaseOidcAuditOptions): Promise<ReleaseOidcAuditReport> {
  clearWorkspaceCache()
  const { packages } = await getWorkspaceData(options.cwd)
  const candidates = packages.filter(({ manifest }) => typeof manifest.name === 'string' && typeof manifest.version === 'string')
  if (!candidates.length) {
    throw new ReleaseCommandError('OIDC audit found no versioned publishable workspace packages')
  }
  if (candidates.some(({ manifest }) => {
    const registry = record(record(manifest)['publishConfig'])['registry']
    return registry !== undefined && (typeof registry !== 'string' || registry.replace(/\/$/, '') !== npmRegistry)
  })) {
    throw new ReleaseCommandError('OIDC audit supports only the official npm registry; no credentials were requested')
  }
  const fetcher = options.fetch ?? globalThis.fetch
  const { idToken, requestToken, identity } = await requestIdentity(options.env ?? process.env, fetcher)
  const names = [...new Set(candidates.map(pkg => pkg.manifest.name!))].sort()
  const results: ReleaseOidcAuditReport['results'] = []
  for (let start = 0; start < names.length; start += 4) {
    results.push(...await Promise.all(names.slice(start, start + 4)
      .map(name => exchangePackage(name, idToken, requestToken, fetcher))))
  }
  const hints = results.some(result => result.status === 404)
    ? [
        'HTTP 404 alone does not prove that a package is missing or that its trusted publisher has expired. Check the npm package settings and the repository, workflow and environment identity.',
        'If npm explicitly reports Expired, delete and recreate the trusted publisher, then complete its first successful publish within 48 hours. Token exchange alone does not validate the configuration.',
        'npm policy: https://github.blog/changelog/2026-10-02-unvalidated-npm-trusted-publishing-configurations-now-expire/',
      ]
    : ['Token exchange success confirms current exchange access only. It does not complete the first successful publish required to validate a new trusted publisher.']
  return { schemaVersion: 1, identity, results, ok: results.every(result => result.ok), hints }
}

export async function runReleaseOidcAudit(options: ReleaseCiOptions) {
  const env = getReleaseEnv(options)
  if (options.sourceSha || env['REPO_RELEASE_RECOVERY_SOURCE_SHA']?.trim()
    || options.dryRun || env['REPO_RELEASE_DRY_RUN'] === 'true'
    || options.packageName || options.packageVersion
    || env['REPO_RELEASE_PACKAGE']?.trim() || env['REPO_RELEASE_VERSION']?.trim()) {
    throw new ReleaseCommandError('oidc-audit cannot be combined with source-sha, dry-run, package or version recovery options')
  }
  const report = await auditReleaseOidc({ cwd: options.cwd, env })
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  if (!report.ok) {
    throw new ReleaseCommandError(`npm OIDC audit failed for ${report.results.filter(result => !result.ok).length}/${report.results.length} packages; see the safe report above`)
  }
  return report
}
