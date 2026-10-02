import type { CreateTargetMarker } from '../index'
import type { ManifestRecordSnapshot } from './record'
import type { ManifestSnapshot } from './state'
import { randomUUID } from 'node:crypto'
import { chmod, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'pathe'
import { readManifestRecord, sameFileIdentity } from './record'
import { readManifestSnapshot, sameManifestSnapshot } from './state'

export { writeCreateManifestRecovery } from './record'
export type { WriteCreateManifestRecoveryOptions } from './record'

export interface CreateManifestRecoveryResult {
  path: string
  status: 'unchanged' | 'would-restore' | 'restored' | 'preserved' | 'unknown'
  reason?: string
}

export interface CreateManifestRecoveryInspection {
  result: CreateManifestRecoveryResult
  blocked: boolean
  record?: ManifestRecordSnapshot
  snapshot?: ManifestSnapshot
}

function blocked(manifestPath: string, reason: string): CreateManifestRecoveryInspection {
  return { result: { path: manifestPath, status: 'preserved', reason }, blocked: true }
}

/** Inspect the persisted before/after values without changing any file. */
export async function inspectCreateManifestRecovery(marker: CreateTargetMarker): Promise<CreateManifestRecoveryInspection> {
  const manifestPath = path.join(marker.cwd, 'pnpm-workspace.yaml')
  if (marker.schemaVersion === 1) {
    return {
      result: { path: manifestPath, status: 'unknown', reason: 'This older create transaction has no manifest recovery record; only target files can be recovered.' },
      blocked: false,
    }
  }
  try {
    const record = await readManifestRecord(marker)
    if (record.value.kind === 'unchanged') {
      return { result: { path: manifestPath, status: 'unchanged' }, blocked: false, record }
    }
    const snapshot = await readManifestSnapshot(manifestPath)
    const originalMatches = snapshot.exists ? snapshot.text === record.value.original : record.value.original === null
    if (originalMatches) {
      return { result: { path: manifestPath, status: 'unchanged' }, blocked: false, record, snapshot }
    }
    if (!snapshot.exists || snapshot.text !== record.value.expected
      || !sameFileIdentity(record.value.published, snapshot.identity)) {
      return blocked(manifestPath, 'The workspace manifest changed after creation; retained it and the create recovery evidence for review.')
    }
    return { result: { path: manifestPath, status: 'would-restore' }, blocked: false, record, snapshot }
  }
  catch {
    return blocked(manifestPath, 'The manifest recovery record or workspace manifest is missing, malformed, unreadable, or changed; retained the create recovery evidence for review.')
  }
}

function sameInspection(left: CreateManifestRecoveryInspection, right: CreateManifestRecoveryInspection) {
  if (!left.record || !right.record || left.record.text !== right.record.text
    || !sameFileIdentity(left.record.identity, right.record.identity)) {
    return false
  }
  return !left.snapshot
    ? !right.snapshot
    : !!right.snapshot && sameManifestSnapshot(left.snapshot, right.snapshot)
}

/** Restore only the manifest still owned by the persisted create transaction. */
export async function applyCreateManifestRecovery(marker: CreateTargetMarker, inspection: CreateManifestRecoveryInspection): Promise<CreateManifestRecoveryInspection> {
  if (inspection.blocked || marker.schemaVersion === 1) {
    return inspection
  }
  const latest = await inspectCreateManifestRecovery(marker)
  if (latest.blocked) {
    return latest
  }
  if (!sameInspection(inspection, latest)) {
    return blocked(inspection.result.path, 'The manifest recovery evidence changed after inspection; retained the transaction for review.')
  }
  if (latest.result.status !== 'would-restore' || latest.record?.value.kind !== 'change') {
    return latest
  }

  const record = latest.record.value
  const manifestPath = latest.result.path
  let temporary: string | undefined
  try {
    if (record.original !== null) {
      temporary = path.join(marker.stagingDir, `.repoctl-manifest-restore-${randomUUID()}`)
      await writeFile(temporary, record.original, { encoding: 'utf8', flag: 'wx', mode: record.originalMode ?? 0o666 })
      if (record.originalMode !== undefined) {
        await chmod(temporary, record.originalMode)
      }
    }
    // Preparing the restored file can take time. Repeat the complete record
    // and manifest comparison immediately before the destination mutation.
    const beforeMutation = await inspectCreateManifestRecovery(marker)
    if (beforeMutation.blocked || !sameInspection(latest, beforeMutation)) {
      return beforeMutation.blocked
        ? beforeMutation
        : blocked(manifestPath, 'The workspace manifest or recovery record changed before restoration; retained the transaction for review.')
    }
    if (temporary) {
      await rename(temporary, manifestPath)
      temporary = undefined
    }
    else {
      await unlink(manifestPath)
    }
    const restored = await readManifestSnapshot(manifestPath)
    if (restored.exists ? restored.text !== record.original : record.original !== null) {
      return blocked(manifestPath, 'The workspace manifest changed during restoration; retained the transaction for review.')
    }
    return { ...latest, result: { path: manifestPath, status: 'restored' }, snapshot: restored }
  }
  catch {
    // A filesystem call can succeed before reporting failure. Reinspection
    // recognizes the restored original on the next explicit recovery attempt.
    return blocked(manifestPath, 'Workspace manifest restoration failed; retained the create recovery evidence so recovery can be retried.')
  }
  finally {
    if (temporary) {
      await unlink(temporary).catch(() => {})
    }
  }
}
