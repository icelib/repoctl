import type { BootstrapManifest, BootstrapReport, PrepareBootstrapOptions } from './types'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { canonicalSnapshotJson } from '../snapshot/prepared/schema'
import { createBootstrapPlan } from './plan'
import { bootstrapArtifact } from './preparation/artifact'
import { assertBootstrapPreparationEnvironment } from './preparation/environment'
import { isolateBootstrap } from './preparation/isolate'
import { bootstrapSourceDirectory } from './preparation/source'
import { bootstrapWorkspace } from './preparation/workspace'

/** 在无发布凭据的隔离目录构建、检查并原生打包一个冻结的公开包。 */
export async function prepareBootstrap(options: PrepareBootstrapOptions): Promise<BootstrapReport> {
  assertBootstrapPreparationEnvironment(options)
  const plan = await createBootstrapPlan({ ...options, source: options.plan.source })
  if (canonicalSnapshotJson(plan) !== canonicalSnapshotJson(options.plan)) {
    throw new Error('Bootstrap candidate source does not match the trusted frozen plan.')
  }
  const report: BootstrapReport = { schemaVersion: 1, status: 'planned', plan }
  if (options.dryRun) {
    return report
  }
  const root = await bootstrapSourceDirectory(options, plan.source)
  const workspace = await bootstrapWorkspace(root, plan.package.name)
  const context = await isolateBootstrap(root, plan, options)
  const { item, entries, portable, integrity } = await bootstrapArtifact(context, plan, options, new Set(workspace.workspace.packages.flatMap(pkg => pkg.manifest.name ? [pkg.manifest.name] : [])))
  const check = item.result
  const manifest: BootstrapManifest = {
    ...plan,
    package: { ...plan.package, tarball: 'tarballs/package.tgz', integrity, files: check.files },
    checks: {
      build: 'passed',
      package: { ...check, directory: plan.package.directory, tarball: 'tarballs/package.tgz', commands: [], diagnostics: check.diagnostics.map(({ detail: _detail, ...diagnostic }) => diagnostic) },
    },
    entries,
    packedManifest: item.manifest,
  }
  await writeFile(path.join(portable, 'bootstrap-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' })
  return { ...report, status: 'prepared', manifest, outputDirectory: portable, checks: [check] }
}
