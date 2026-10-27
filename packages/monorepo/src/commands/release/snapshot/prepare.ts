import type { SnapshotPublicationTarget } from './archive/finalize'
import type { SnapshotOptions, SnapshotReport } from './types'
import { rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { prepareSnapshotArtifacts } from './artifacts'
import { isolateSnapshot } from './isolate'
import { writeSnapshotManifests } from './manifests'
import { isolatedSnapshotEnvironment } from './process'
import { assertPreparedArtifacts, prepareSnapshotSource } from './source/prepare'

export async function checkpointSnapshot(report: SnapshotReport) {
  if (report.outputDirectory) {
    const target = path.join(report.outputDirectory, 'snapshot-report.json')
    await writeFile(`${target}.tmp`, `${JSON.stringify(report, null, 2)}\n`)
    await rename(`${target}.tmp`, target)
  }
}

/** Shared internal preparation; only the caller decides whether and where to upload. */
export async function prepareNightlySnapshot(report: SnapshotReport, options: SnapshotOptions, target: SnapshotPublicationTarget): Promise<void> {
  try {
    const source = await isolateSnapshot(report, options)
    await checkpointSnapshot(report)
    const references = await writeSnapshotManifests(source, report)
    await prepareSnapshotSource(source, report, options)
    await checkpointSnapshot(report)
    await prepareSnapshotArtifacts(source, report, { ...options, env: isolatedSnapshotEnvironment(options, report.outputDirectory!) }, target, references)
    await assertPreparedArtifacts(source, report)
    await checkpointSnapshot(report)
  }
  catch (error) {
    report.status = 'failed'
    report.error = error instanceof Error ? error.message : String(error)
    await checkpointSnapshot(report)
    throw error
  }
}
