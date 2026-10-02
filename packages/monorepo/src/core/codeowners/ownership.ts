import type { CodeownersOptions, CodeownersReport, WorkspaceOwnership } from './types'
import { realpath } from 'node:fs/promises'
import path from 'node:path'
import { loadMonorepoConfigDetails } from '../config'
import { clearWorkspaceCache, getWorkspaceData } from '../workspace'

const ownerPattern = /^(?:@[a-z\d](?:[a-z\d-]*[a-z\d])?(?:\/[a-z\d](?:[\w-]*[a-z\d])?)?|[^\s@#]+@[^\s#@][^\s#.@]*\.[^\s#@]+)$/iu

export async function inspectWorkspaceOwners(options: CodeownersOptions): Promise<CodeownersReport> {
  clearWorkspaceCache()
  const { workspaceDir, packages } = await getWorkspaceData(await realpath(options.cwd), { ignorePrivatePackage: false, ignoreRootPackage: false })
  const loaded = await loadMonorepoConfigDetails(workspaceDir, { refresh: true })
  const report: CodeownersReport = { schemaVersion: 1, workspaceDir, configFile: loaded.file, configFiles: loaded.files, packages: [], diagnostics: [] }
  const records: WorkspaceOwnership[] = packages.map(pkg => ({
    path: path.relative(workspaceDir, pkg.rootDir).replaceAll('\\', '/') || '.',
    ...(pkg.manifest.name ? { name: pkg.manifest.name } : {}),
    private: pkg.manifest.private === true,
    owners: [],
    sources: [],
  }))
  const config = loaded.config.codeowners
  const mappings: unknown = config?.owners ?? {}
  if ((config !== undefined && (!config || typeof config !== 'object' || Array.isArray(config) || config.owners === undefined)) || !mappings || typeof mappings !== 'object' || Array.isArray(mappings)) {
    report.diagnostics.push({ code: 'INVALID_CONFIG', severity: 'error', source: 'codeowners.owners', message: 'Expected an object mapping exact workspace names or paths to owner arrays.' })
  }
  else {
    for (const [key, value] of Object.entries(mappings).sort(([a], [b]) => a.localeCompare(b))) {
      const source = `codeowners.owners[${JSON.stringify(key)}]`
      const matches = records.filter(pkg => pkg.name === key || pkg.path === key.replace(/^\.\//u, '').replace(/\/$/u, ''))
      if (matches.length !== 1) {
        report.diagnostics.push({ code: matches.length ? 'AMBIGUOUS_WORKSPACE' : 'UNKNOWN_WORKSPACE', severity: 'error', source, message: `Expected one workspace for ${key}; found ${matches.length}.` })
        continue
      }
      const pkg = matches[0]!
      pkg.sources.push(source)
      if (!Array.isArray(value) || !value.length || value.some(owner => typeof owner !== 'string' || /\s/u.test(owner) || !ownerPattern.test(owner))) {
        report.diagnostics.push({ code: 'INVALID_OWNER', severity: 'error', source, message: 'Use a nonempty array of @user, @org/team, or email owners; identities are not verified remotely.' })
        continue
      }
      pkg.owners = [...new Set([...pkg.owners, ...value])].sort()
    }
  }
  report.packages = records.filter(pkg => pkg.path !== '.' || pkg.sources.length > 0).sort((a, b) => a.path.localeCompare(b.path))
  for (const pkg of report.packages) {
    if (!pkg.owners.length) {
      report.diagnostics.push({ code: 'MISSING_OWNER', severity: 'warning', source: pkg.path, message: `No owner is configured for ${pkg.name ?? pkg.path}.` })
    }
    if (pkg.path.startsWith('../') || /[\n\r\t*?[\]\\#]/u.test(pkg.path)) {
      report.diagnostics.push({ code: 'UNSUPPORTED_PATH', severity: 'error', source: pkg.path, message: 'This workspace path cannot be represented safely as a literal CODEOWNERS directory rule.' })
    }
  }
  if (options.query) {
    report.packages = report.packages.filter(pkg => pkg.name === options.query || pkg.path === options.query)
  }
  return report
}
