import { lstat, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import process from 'node:process'
import path from 'pathe'
import { isDirectChild, isPathInside, samePath } from './paths'
import { removeCreateStaging } from './staging-cleanup'

export { removeCreateStaging } from './staging-cleanup'

interface CreateStagingMarker {
  schemaVersion: 1 | 2
  pid: number
  cwd: string
  targetDir: string
  createdAt: number
}

/**
 * A marker installed at the root of a target while it is being published.
 *
 * The marker is deliberately ephemeral: successful creates remove it, while
 * an interrupted process leaves it behind as evidence that the target may be
 * partial.  It is an inspection aid only; recovery never removes target
 * files automatically because a user may have edited the target after the
 * interruption.
 */
export interface CreateTargetMarker {
  schemaVersion: 1 | 2
  pid: number
  cwd: string
  targetDir: string
  stagingDir: string
  createdAt: number
}

export type CreateTargetInspectionStatus = 'missing' | 'malformed' | 'active' | 'stale'

export interface CreateTargetInspection {
  targetDir: string
  markerPath: string
  status: CreateTargetInspectionStatus
  marker?: CreateTargetMarker
  reason?: string
}

export const createStagingMarkerName = '.repoctl-create.json'
export const createTargetMarkerName = '.repoctl-create-target.json'

// A recently terminated process may still have its pid reused by another
// process. Leave young markers alone and let the next retry clean them up
// after this conservative grace period.
const staleCreateStagingAgeMs = 24 * 60 * 60 * 1000

function isProcessAlive(pid: number) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false
  }
  try {
    process.kill(pid, 0)
    return true
  }
  catch (error) {
    // EPERM means the process exists but is not signalable by this user.
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function isCreateStagingMarker(value: unknown): value is CreateStagingMarker {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const marker = value as Partial<CreateStagingMarker>
  const pid = marker.pid
  return (marker.schemaVersion === 1 || marker.schemaVersion === 2)
    && typeof pid === 'number'
    && Number.isSafeInteger(pid)
    && pid > 0
    && typeof marker.cwd === 'string'
    && typeof marker.targetDir === 'string'
    && typeof marker.createdAt === 'number'
    && Number.isFinite(marker.createdAt)
}

function isCreateTargetMarker(value: unknown): value is CreateTargetMarker {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const marker = value as Partial<CreateTargetMarker>
  const pid = marker.pid
  return (marker.schemaVersion === 1 || marker.schemaVersion === 2)
    && typeof pid === 'number'
    && Number.isSafeInteger(pid)
    && pid > 0
    && typeof marker.cwd === 'string'
    && typeof marker.targetDir === 'string'
    && typeof marker.stagingDir === 'string'
    && typeof marker.createdAt === 'number'
    && Number.isFinite(marker.createdAt)
}

export async function writeCreateStagingMarker(staging: string, cwd: string, targetDir: string) {
  await writeFile(path.join(staging, createStagingMarkerName), `${JSON.stringify({
    schemaVersion: 2,
    pid: process.pid,
    cwd,
    targetDir,
    createdAt: Date.now(),
  } satisfies CreateStagingMarker)}\n`, 'utf8')
}

export async function writeCreateTargetMarker(targetDir: string, cwd: string, stagingDir: string) {
  const marker: CreateTargetMarker = {
    schemaVersion: 2,
    pid: process.pid,
    cwd,
    targetDir,
    stagingDir,
    createdAt: Date.now(),
  }
  await writeFile(path.join(targetDir, createTargetMarkerName), `${JSON.stringify(marker)}\n`, { encoding: 'utf8', flag: 'wx' })
}
/**
 * Inspect a target marker without changing the target or its staging area.
 *
 * A stale marker means the publishing process is gone and the conservative
 * age guard has elapsed.  Callers may present that fact to a user and choose
 * a recovery policy; this function intentionally performs no cleanup.
 */
export async function inspectCreateTarget(targetDir: string, now = Date.now()): Promise<CreateTargetInspection> {
  const markerPath = path.join(targetDir, createTargetMarkerName)
  try {
    const targetStat = await lstat(targetDir)
    if (!targetStat.isDirectory() || targetStat.isSymbolicLink()) {
      return { targetDir, markerPath, status: 'malformed', reason: 'Inspected target is not a real directory.' }
    }
    const markerStat = await lstat(markerPath)
    if (!markerStat.isFile() || markerStat.isSymbolicLink()) {
      return { targetDir, markerPath, status: 'malformed', reason: 'Target ownership marker is not a regular file.' }
    }
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { targetDir, markerPath, status: 'missing' }
    }
    return { targetDir, markerPath, status: 'malformed', reason: 'Unable to inspect target ownership marker.' }
  }
  let marker: unknown
  try {
    marker = JSON.parse(await readFile(markerPath, 'utf8'))
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { targetDir, markerPath, status: 'missing' }
    }
    return { targetDir, markerPath, status: 'malformed', reason: 'Unable to read target ownership marker.' }
  }

  if (!isCreateTargetMarker(marker)) {
    return { targetDir, markerPath, status: 'malformed', reason: 'Target ownership marker has an unsupported shape.' }
  }

  if (!await samePath(marker.targetDir, targetDir)
    || !await isPathInside(marker.cwd, marker.targetDir)
    || !await isDirectChild(marker.cwd, marker.stagingDir, '.repoctl-create-')) {
    return { targetDir, markerPath, status: 'malformed', marker, reason: 'Target ownership marker or staging directory is outside its workspace or does not match the inspected target.' }
  }

  const markerAge = now - marker.createdAt
  if (isProcessAlive(marker.pid) || markerAge < staleCreateStagingAgeMs) {
    return { targetDir, markerPath, status: 'active', marker }
  }
  return { targetDir, markerPath, status: 'stale', marker }
}

export async function removeCreateTargetMarker(targetDir: string) {
  await unlink(path.join(targetDir, createTargetMarkerName)).catch((error) => {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  })
}

async function isCreateTargetAbsent(targetDir: string) {
  try {
    await lstat(targetDir)
    return false
  }
  catch (error) {
    // Existing targets can still need this snapshot for explicit recovery.
    // Missing, damaged, or unreadable ownership metadata does not prove that
    // their contents are safe to discard, so only a missing target is enough
    // evidence for automatic staging cleanup. lstat also preserves dangling
    // symbolic targets rather than treating them as absent.
    return (error as NodeJS.ErrnoException).code === 'ENOENT'
  }
}

/**
 * Remove only staging directories that this process can positively identify
 * as an old repoctl create transaction. A marker is deliberately required:
 * unmarked `.repoctl-create-*` directories may belong to an older repoctl
 * process or to the user and are left untouched. Existing targets retain
 * their staging snapshot for explicit recovery, even with unknown metadata.
 */
export async function cleanupStaleCreateStaging(cwd: string, now = Date.now()) {
  let entries
  try {
    entries = await readdir(cwd, { withFileTypes: true })
  }
  catch {
    return
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('.repoctl-create-')) {
      continue
    }
    const staging = path.join(cwd, entry.name)
    const markerPath = path.join(staging, createStagingMarkerName)
    let marker: CreateStagingMarker
    try {
      marker = JSON.parse(await readFile(markerPath, 'utf8')) as CreateStagingMarker
    }
    catch {
      continue
    }
    const relativeTarget = isCreateStagingMarker(marker)
      ? path.relative(path.resolve(cwd), path.resolve(marker.targetDir))
      : ''
    if (!isCreateStagingMarker(marker) || path.resolve(marker.cwd) !== path.resolve(cwd) || !relativeTarget || relativeTarget === '..' || relativeTarget.startsWith(`..${path.sep}`) || path.isAbsolute(relativeTarget)) {
      continue
    }
    if (isProcessAlive(marker.pid) || now - marker.createdAt < staleCreateStagingAgeMs) {
      continue
    }
    if (!await isCreateTargetAbsent(marker.targetDir)) {
      continue
    }
    let stagingStat
    try {
      stagingStat = await lstat(staging)
    }
    catch {
      continue
    }
    if (!stagingStat.isDirectory() || stagingStat.isSymbolicLink()) {
      continue
    }
    await removeCreateStaging(staging, stagingStat).catch(() => {})
  }
}

export { recoverCreateTarget } from './target'
export type { RecoverCreateTargetOptions, RecoverCreateTargetResult } from './target'
