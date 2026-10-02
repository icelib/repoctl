import type { RecoveryContext } from './compare'
import type { CreateTargetInspection, CreateTargetInspectionStatus } from './index'
import type { CreateManifestRecoveryResult } from './manifest'
import path from 'pathe'
import { clearWorkspaceCache } from '../../../core/workspace'
import { ensureStagingIdentity, ensureTargetIdentity, inspectGeneratedEntry, readStat, readTargetEntries } from './compare'
import { finishCreateRecovery } from './finish'
import { createTargetMarkerName, inspectCreateTarget } from './index'
import { applyCreateManifestRecovery, inspectCreateManifestRecovery } from './manifest'
import { readMatchingStagingMarker } from './staging'

export interface RecoverCreateTargetOptions {
  /** Do not change the target, workspace manifest, or staging directory. */
  dryRun?: boolean
  /** Override the clock used for stale-marker checks, primarily for tests. */
  now?: number
}

export interface RecoverCreateTargetResult {
  targetDir: string
  status: CreateTargetInspectionStatus
  dryRun: boolean
  removed: string[]
  preserved: string[]
  targetRemoved: boolean
  stagingRemoved: boolean
  /** Workspace manifest recovery decision, when ownership metadata is usable. */
  manifest?: CreateManifestRecoveryResult
  reason?: string
}

function baseResult(targetDir: string, inspection: CreateTargetInspection, dryRun: boolean): RecoverCreateTargetResult {
  return {
    targetDir,
    status: inspection.status,
    dryRun,
    removed: [],
    preserved: [],
    targetRemoved: false,
    stagingRemoved: false,
    ...(inspection.reason ? { reason: inspection.reason } : {}),
  }
}

function preserveManifestForUserFiles(result: RecoverCreateTargetResult) {
  if (result.manifest?.status === 'would-restore') {
    result.manifest = {
      path: result.manifest.path,
      status: 'preserved',
      reason: 'The target contains user files; retained its workspace manifest entry until recovery can remove the target.',
    }
  }
}

/**
 * Safely discard the portion of an interrupted create that still matches its
 * staging snapshot. Files edited or added after the interruption are reported
 * and retained. A dry run performs the same comparisons without writing.
 */
export async function recoverCreateTarget(inputTargetDir: string, options: RecoverCreateTargetOptions = {}): Promise<RecoverCreateTargetResult> {
  const targetDir = path.resolve(inputTargetDir)
  const dryRun = options.dryRun ?? false
  const inspection = await inspectCreateTarget(targetDir, options.now)
  const result = baseResult(targetDir, inspection, dryRun)
  if (inspection.status !== 'stale' || !inspection.marker) {
    return result
  }

  const stagingDir = path.resolve(inspection.marker.stagingDir)
  const targetStat = await readStat(targetDir)
  if (!targetStat || !targetStat.isDirectory() || targetStat.isSymbolicLink()) {
    result.status = 'malformed'
    result.reason = 'The inspected target changed to a non-directory; target files were retained.'
    return result
  }
  const stagingRelative = path.relative(path.resolve(inspection.marker.cwd), stagingDir)
  const stagingStat = await readStat(stagingDir)
  if (!stagingRelative || path.isAbsolute(stagingRelative) || stagingRelative.includes(path.sep)
    || !path.basename(stagingDir).startsWith('.repoctl-create-')) {
    result.reason = 'The create staging directory is outside the workspace or is not a real directory; target files were retained.'
    return result
  }
  if (!stagingStat?.isDirectory() || stagingStat.isSymbolicLink()) {
    result.reason = 'The matching create staging snapshot is missing or malformed; target files were retained.'
    return result
  }
  const stagingMarker = await readMatchingStagingMarker(inspection.marker)
  const stagedTarget = path.join(stagingDir, 'project')
  const stagedTargetStat = await readStat(stagedTarget)
  if (!stagingMarker || !stagedTargetStat || !stagedTargetStat.isDirectory() || stagedTargetStat.isSymbolicLink()) {
    result.reason = 'The matching create staging snapshot is missing or malformed; target files were retained.'
    return result
  }

  const manifest = await inspectCreateManifestRecovery(inspection.marker)
  result.manifest = manifest.result
  if (manifest.blocked) {
    result.reason = manifest.result.reason ?? 'Workspace manifest recovery requires review.'
    return result
  }

  // Analyze first without mutating. The marker is checked again below before
  // applying the same snapshot, so a concurrent writer cannot race a delete.
  const context: RecoveryContext = { targetDir, stagedTarget, targetIdentity: targetStat, stagingDir, stagingIdentity: stagingStat, dryRun: true, removed: [], preserved: [], rootChanged: false, stagingChanged: false }
  const targetEntries = await readTargetEntries(context)
  if (!targetEntries) {
    result.reason = 'The target directory changed during recovery; target files were retained.'
    return result
  }
  for (const entry of targetEntries) {
    if (entry === createTargetMarkerName) {
      continue
    }
    await inspectGeneratedEntry(path.join(stagedTarget, entry), path.join(targetDir, entry), entry, context)
  }
  result.removed.push(...context.removed)
  result.preserved.push(...context.preserved)
  if (result.preserved.length) {
    preserveManifestForUserFiles(result)
  }

  // A partial target may contain both generated files and user edits.  The
  // generated files that still match the staging snapshot are safe to remove
  // even when unrelated files must be preserved.  Keep the read-only preview
  // branch above, then let the applied pass remove matching entries and retain
  // the marker/staging snapshot for the caller to review the preserved state.
  if (dryRun) {
    return result
  }

  if (context.rootChanged || context.stagingChanged) {
    result.reason = context.stagingChanged
      ? 'The staging directory changed during recovery; target files were retained.'
      : 'The target directory changed during recovery; target files were retained.'
    return result
  }

  // Re-read the marker before removing any generated file. This prevents a
  // concurrent create or user edit from being mistaken for the stale transaction.
  const latest = await inspectCreateTarget(targetDir, options.now)
  if (latest.status !== 'stale' || !latest.marker || JSON.stringify(latest.marker) !== JSON.stringify(inspection.marker)) {
    result.reason = 'The target ownership marker changed during recovery; retained the target for review.'
    return result
  }
  const latestManifest = await inspectCreateManifestRecovery(inspection.marker)
  if (latestManifest.blocked) {
    result.removed = []
    result.manifest = latestManifest.result
    result.reason = latestManifest.result.reason ?? 'Workspace manifest recovery requires review.'
    return result
  }

  const applied: RecoveryContext = { targetDir, stagedTarget, targetIdentity: targetStat, stagingDir, stagingIdentity: stagingStat, dryRun: false, removed: [], preserved: [], rootChanged: false, stagingChanged: false }
  const appliedEntries = await readTargetEntries(applied)
  if (!appliedEntries) {
    result.reason = 'The target directory changed during recovery; target files were retained.'
    return result
  }
  for (const entry of appliedEntries) {
    if (entry === createTargetMarkerName) {
      continue
    }
    await inspectGeneratedEntry(path.join(stagedTarget, entry), path.join(targetDir, entry), entry, applied)
  }
  result.removed = applied.removed
  result.preserved = applied.preserved
  if (result.preserved.length > 0) {
    preserveManifestForUserFiles(result)
    return result
  }

  if (applied.rootChanged || applied.stagingChanged || !await ensureTargetIdentity(applied) || !await ensureStagingIdentity(applied)) {
    result.reason = applied.stagingChanged
      ? 'The staging directory changed during recovery; target files were retained.'
      : 'The target directory changed during recovery; target files were retained.'
    return result
  }

  // User files may have appeared during the applied pass. Keep the workspace
  // inclusion until only ownership metadata remains; preserve that metadata
  // while restoring the manifest so another interrupted recovery can retry.
  const remaining = await readTargetEntries(applied)
  if (!remaining || remaining.some(entry => entry !== createTargetMarkerName)) {
    preserveManifestForUserFiles(result)
    result.reason = 'The target contains files added during recovery; retained its workspace manifest for review.'
    return result
  }
  const beforeRestore = await inspectCreateTarget(targetDir, options.now)
  if (beforeRestore.status !== 'stale' || !beforeRestore.marker || JSON.stringify(beforeRestore.marker) !== JSON.stringify(inspection.marker)) {
    result.reason = 'The target ownership marker changed during recovery; retained the workspace manifest for review.'
    return result
  }
  const restored = await applyCreateManifestRecovery(inspection.marker, manifest)
  result.manifest = restored.result
  if (restored.blocked) {
    result.reason = restored.result.reason ?? 'Workspace manifest recovery requires review.'
    return result
  }
  if (restored.result.status === 'restored') {
    clearWorkspaceCache()
  }

  return finishCreateRecovery(applied, inspection.marker, result)
}
