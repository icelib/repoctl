import type { PackedManifest } from '../../../package-check/types'
import type { SnapshotBuildPackage, SnapshotBuildPlan, SnapshotBuildPlanOptions, SnapshotDependency } from './types'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parse } from 'yaml'
import { clearWorkspaceCache, getWorkspaceData } from '../../../../core/workspace'
import { dependencyReferences } from '../../../package-check/dependencies'
import { createSnapshotPlan } from '../plan'
import { snapshotCommand } from '../process'
import { validateSnapshotBuildPlan, validateSnapshotSource } from './schema'

export { snapshotPlanDigest, validateSnapshotBuildPlan } from './schema'

/** Freeze the existing version solver and workspace graph without installing or building candidates. */
export async function createSnapshotBuildPlan(options: SnapshotBuildPlanOptions): Promise<SnapshotBuildPlan> {
  const source = validateSnapshotSource(options.source)
  if (/^(?:120000|160000) /m.test(snapshotCommand('git', ['ls-tree', '-r', source.mergeSha], options))) {
    throw new Error('Prepared snapshots do not support source symbolic links or Git submodules.')
  }
  const identity = { kind: 'pr' as const, pullRequest: source.pullRequest, commit: source.mergeSha, buildId: `run-${source.runId}-attempt-${source.runAttempt}` }
  const report = await createSnapshotPlan({ ...options, identity, registry: 'https://registry.npmjs.org/' })
  clearWorkspaceCache()
  const workspace = await getWorkspaceData(options.cwd, { ignorePrivatePackage: false, ignoreRootPackage: false })
  const configuration = parse(await readFile(path.join(report.source, 'pnpm-workspace.yaml'), 'utf8'))
  const root = JSON.parse(await readFile(path.join(report.source, 'package.json'), 'utf8')) as { packageManager?: string }
  const pin = /^pnpm@(\d+\.\d+\.\d+)(?:\+sha\d+\.[a-f0-9]+)?$/.exec(root.packageManager ?? '')
  if (!pin || report.nativePlan.pnpmVersion !== pin[1]) {
    throw new Error('Snapshot preparation requires the trusted pnpm version to match the source packageManager pin.')
  }
  const byName = new Map(workspace.packages.map(pkg => [pkg.manifest.name, pkg]))
  const byDirectory = new Map(workspace.packages.map(pkg => [path.resolve(pkg.rootDir), pkg]))
  const versions = new Map(report.packages.map(pkg => [pkg.name, pkg.version]))
  const packages: SnapshotBuildPackage[] = report.packages.map((pkg) => {
    const original = byName.get(pkg.name)!
    const dependencies: SnapshotDependency[] = []
    for (const reference of dependencyReferences(original.manifest as PackedManifest, original.rootDir, true)) {
      const catalog = reference.range.startsWith('catalog:') ? reference.range.slice(8) || 'default' : undefined
      const catalogValue = catalog === 'default' ? (configuration.catalog ?? configuration.catalogs?.default)?.[reference.alias] : catalog ? configuration.catalogs?.[catalog]?.[reference.alias] : undefined
      const resolved = typeof catalogValue === 'string'
        ? dependencyReferences({ [reference.field]: { [reference.alias]: catalogValue } }, original.rootDir, true)[0]!
        : reference
      const target = resolved.directory ? byDirectory.get(path.resolve(resolved.directory)) : byName.get(resolved.name)
      if (!target) {
        if (resolved.protocol !== 'registry' || (catalog && typeof catalogValue !== 'string')) {
          throw new Error(`Snapshot plan cannot resolve dependency ${pkg.name}: ${reference.alias}.`)
        }
        continue
      }
      const version = versions.get(target.manifest.name!)
      if (!version) {
        if (reference.field !== 'devDependencies') {
          throw new Error(`Public snapshot ${pkg.name} depends on private workspace ${target.manifest.name}.`)
        }
        continue
      }
      dependencies.push({ field: reference.field as SnapshotDependency['field'], alias: reference.alias, name: target.manifest.name!, version })
    }
    dependencies.sort((a, b) => `${a.field}.${a.alias}`.localeCompare(`${b.field}.${b.alias}`))
    return { ...pkg, directory: pkg.directory.split(path.sep).join('/'), dependencies }
  })
  return validateSnapshotBuildPlan({
    schemaVersion: 1,
    source,
    identity,
    identityKey: report.identityKey,
    tag: report.tag,
    registry: 'https://registry.npmjs.org/',
    packageManager: root.packageManager,
    packages,
  })
}
