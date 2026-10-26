import type { ReleaseOidcArtifactAuditOptions, ReleaseOidcAuditOptions } from '../../../core/oidc/types'
import { valid } from 'semver'
import validatePackageName from 'validate-npm-package-name'
import { npmRegistry, record } from '../../../core/oidc/identity'
import { clearWorkspaceCache, getWorkspaceData } from '../../../core/workspace'
import { ReleaseCommandError } from '../errors'

export async function auditCandidates(options: ReleaseOidcAuditOptions | ReleaseOidcArtifactAuditOptions): Promise<string[]> {
  if (options.packages !== undefined) {
    if (options.cwd !== undefined || options.packageNames !== undefined || !Array.isArray(options.packages)
      || !options.packages.length || new Set(options.packages.map(pkg => pkg?.name)).size !== options.packages.length
      || options.packages.some(pkg => !pkg || typeof pkg.name !== 'string' || !validatePackageName(pkg.name).validForNewPackages
        || typeof pkg.version !== 'string' || !valid(pkg.version)
        || (pkg.registry !== undefined && (typeof pkg.registry !== 'string' || pkg.registry.replace(/\/$/, '') !== npmRegistry)))) {
      throw new ReleaseCommandError('OIDC audit requires unique versioned artifact packages on the official npm registry; no credentials were requested')
    }
    return options.packages.map(pkg => pkg.name).sort()
  }
  if (typeof options.cwd !== 'string' || !options.cwd.trim()
    || (options.packageNames !== undefined && (!Array.isArray(options.packageNames)
      || options.packageNames.some(name => typeof name !== 'string' || !validatePackageName(name).validForNewPackages)))) {
    throw new ReleaseCommandError('OIDC audit requires a workspace or valid artifact candidates; no credentials were requested')
  }
  clearWorkspaceCache()
  const { packages } = await getWorkspaceData(options.cwd, { ignoreRootPackage: !options.packageNames })
  const available = packages.filter(({ manifest }) => typeof manifest.name === 'string' && typeof manifest.version === 'string')
  const candidates = options.packageNames ? available.filter(pkg => options.packageNames!.includes(pkg.manifest.name!)) : available
  if (options.packageNames && (new Set(options.packageNames).size !== options.packageNames.length
    || candidates.length !== options.packageNames.length || new Set(candidates.map(pkg => pkg.manifest.name)).size !== candidates.length)) {
    throw new ReleaseCommandError('OIDC audit candidates do not exactly match the public workspace package plan; no credentials were requested')
  }
  if (!candidates.length) {
    throw new ReleaseCommandError('OIDC audit found no versioned publishable workspace packages')
  }
  if (candidates.some(({ manifest }) => {
    const registry = record(record(manifest)['publishConfig'])['registry']
    return registry !== undefined && (typeof registry !== 'string' || registry.replace(/\/$/, '') !== npmRegistry)
  })) {
    throw new ReleaseCommandError('OIDC audit supports only the official npm registry; no credentials were requested')
  }
  return [...new Set(candidates.map(pkg => pkg.manifest.name!))].sort()
}
