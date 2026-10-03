import type { SnapshotOptions, SnapshotReport } from './types'
import { rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { prepareSnapshotArtifacts } from './artifacts'
import { assertSnapshotAuthorization } from './identity'
import { isolateSnapshot } from './isolate'
import { writeSnapshotManifests } from './manifests'
import { createSnapshotPlan } from './plan'
import { isolatedSnapshotEnvironment } from './process'
import { publishSnapshotArtifacts } from './publish'

export { createSnapshotPlan } from './plan'
export type { SnapshotIdentity, SnapshotOptions, SnapshotPackage, SnapshotReport } from './types'

/** Prepare immutable package artifacts in an archive of HEAD; original files and Git refs are never versioned. */
export async function releaseSnapshot(options: SnapshotOptions): Promise<SnapshotReport> {
  const report = await createSnapshotPlan(options)
  if (options.dryRun) {
    return report
  }
  if (options.publish) {
    await assertSnapshotAuthorization(options)
  }
  const checkpoint = async () => {
    if (report.outputDirectory) {
      const target = path.join(report.outputDirectory, 'snapshot-report.json')
      await writeFile(`${target}.tmp`, `${JSON.stringify(report, null, 2)}\n`)
      await rename(`${target}.tmp`, target)
    }
  }
  try {
    const source = await isolateSnapshot(report, options)
    const isolatedOptions = { ...options, env: isolatedSnapshotEnvironment(options, report.outputDirectory!) }
    await checkpoint()
    await writeSnapshotManifests(source, report)
    await prepareSnapshotArtifacts(source, report, isolatedOptions)
    await checkpoint()
    if (options.publish) {
      await publishSnapshotArtifacts(report, isolatedOptions, checkpoint)
    }
  }
  catch (error) {
    report.status = 'failed'
    report.error = error instanceof Error ? error.message : String(error)
  }
  await checkpoint()
  return report
}
