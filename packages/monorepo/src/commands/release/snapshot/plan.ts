import type { SnapshotOptions, SnapshotReport } from './types'
import { readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { parse } from 'semver'
import validatePackageName from 'validate-npm-package-name'
import { parse as parseYaml } from 'yaml'
import { clearWorkspaceCache, getWorkspaceData } from '../../../core/workspace'
import { dependencyReferences } from '../../package-check/dependencies'
import { createNativeReleasePlan } from '../plan/native-report'
import { assertSnapshotSource, snapshotIdentity } from './identity'

/** Reuse pnpm's version explanations, while snapshotting every public package together. */
export async function createSnapshotPlan(options: SnapshotOptions): Promise<SnapshotReport> {
  const { identity, key, tag } = snapshotIdentity(options)
  const registry = new URL(options.registry ?? 'https://registry.npmjs.org/')
  if (registry.username || registry.password || registry.search || registry.hash
    || (registry.protocol !== 'https:' && !(registry.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(registry.hostname)))) {
    throw new Error('Snapshot registry must use HTTPS (HTTP is only allowed for a local test registry), without URL credentials, queries or fragments.')
  }
  const source = await realpath(assertSnapshotSource(options))
  const nativePlan = await createNativeReleasePlan({ ...options, cwd: source })
  if (nativePlan.status === 'blocked') {
    throw new Error(`Snapshot native release plan is blocked: ${nativePlan.blockers.map(item => `${item.id}: ${item.detail}`).join('; ')}`)
  }
  clearWorkspaceCache()
  const workspace = await getWorkspaceData(source, { ignorePrivatePackage: false, ignoreRootPackage: false })
  const manifest = parseYaml(await readFile(path.join(source, 'pnpm-workspace.yaml'), 'utf8'))
  if (manifest.packages?.some((pattern: string) => path.isAbsolute(pattern.replace(/^!/, '')) || pattern.split(/[\\/]/).includes('..'))) {
    throw new Error('Snapshot workspace patterns must stay inside the source repository.')
  }
  const seen = new Set<string>()
  for (const pkg of workspace.packages) {
    const paths = [pkg.rootDir, ...dependencyReferences(pkg.manifest, pkg.rootDir, true).flatMap(ref => ref.directory ? [ref.directory] : [])]
    if (paths.some((target) => {
      const relative = path.relative(source, path.resolve(target))
      return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
    })) {
      throw new Error('Snapshot packages and local dependencies must stay inside the source repository.')
    }
    if (pkg.manifest.name) {
      if (seen.has(pkg.manifest.name)) {
        throw new Error(`Duplicate snapshot workspace package: ${pkg.manifest.name}`)
      }
      seen.add(pkg.manifest.name)
    }
  }
  const packages = workspace.packages.filter(pkg => pkg.manifest.private !== true).map((pkg) => {
    const name = pkg.manifest.name
    const planned = nativePlan.packages.find(item => item.name === name)
    const version = parse(planned?.newVersion ?? pkg.manifest.version ?? '')
    if (!name || !validatePackageName(name).validForNewPackages || !version || !pkg.manifest.version) {
      throw new Error('Snapshot packages need unique names and valid versions.')
    }
    return {
      name,
      directory: path.relative(source, pkg.rootDir) || '.',
      currentVersion: pkg.manifest.version,
      version: `${version.major}.${version.minor}.${version.patch}-snapshot.${identity.kind}.${identity.kind === 'pr' ? `${identity.pullRequest}.` : ''}c${identity.commit}.b${key}`,
      reasons: planned?.reasons.length ? planned.reasons : ['snapshot-workspace'],
    }
  }).sort((a, b) => a.name.localeCompare(b.name))
  if (!packages.length) {
    throw new Error('No public versioned workspace packages are available for snapshots.')
  }
  assertSnapshotSource({ ...options, cwd: source })
  const installArgs = ['add', ...packages.map(pkg => `${pkg.name}@${pkg.version}`), '--registry', registry.href]
  const quote = (value: string) => /^[\w@./:-]+$/.test(value) ? value : `'${value.replaceAll('\'', '\'\\\'\'')}'`
  return {
    schemaVersion: 1,
    identity,
    identityKey: key,
    source,
    tag,
    registry: registry.href,
    status: 'planned',
    packages,
    nativePlan,
    install: { executable: 'pnpm', args: installArgs },
    installCommand: `pnpm ${installArgs.map(quote).join(' ')}`,
  }
}
