import type { SnapshotOptions, SnapshotReport } from './types'
import { assertSnapshotAuthorization } from './identity'
import { createSnapshotPlan } from './plan'
import { checkpointSnapshot, prepareNightlySnapshot } from './prepare'
import { isolatedSnapshotEnvironment } from './process'
import { publishSnapshotArtifacts } from './publish'

export { createSnapshotPlan } from './plan'
export { prepareNightlySnapshot } from './prepare'
export type { SnapshotIdentity, SnapshotOptions, SnapshotPackage, SnapshotPreparationContext, SnapshotPreparationReceipt, SnapshotPreparationResult, SnapshotReferenceGitlink, SnapshotReport } from './types'

/** Prepare immutable package artifacts in an archive of HEAD; original files and Git refs are never versioned. */
export async function releaseSnapshot(options: SnapshotOptions): Promise<SnapshotReport> {
  const report = await createSnapshotPlan(options)
  if (options.dryRun) {
    return report
  }
  if (options.publish) {
    await assertSnapshotAuthorization(options)
  }
  const checkpoint = () => checkpointSnapshot(report)
  try {
    await prepareNightlySnapshot(report, options, { provider: 'npm', repository: '' })
    const isolatedOptions = { ...options, env: isolatedSnapshotEnvironment(options, report.outputDirectory!) }
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
