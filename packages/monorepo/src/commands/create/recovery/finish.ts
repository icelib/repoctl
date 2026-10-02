import type { RecoveryContext } from './compare'
import type { CreateTargetMarker } from './index'
import type { RecoverCreateTargetResult } from './target'
import { readFile, rmdir, unlink, writeFile } from 'node:fs/promises'
import path from 'pathe'
import { ensureStagingIdentity, ensureTargetIdentity, readStat } from './compare'
import { createTargetMarkerName } from './index'
import { removeCreateStaging } from './staging-cleanup'

/** Remove ownership evidence only after target and manifest recovery succeed. */
export async function finishCreateRecovery(context: RecoveryContext, marker: CreateTargetMarker, result: RecoverCreateTargetResult) {
  const { targetDir, stagingDir, stagingIdentity: stagingStat } = context
  if (!await ensureTargetIdentity(context) || !await ensureStagingIdentity(context)) {
    result.reason = 'The target or staging directory changed before cleanup; retained the recovery evidence for review.'
    return result
  }
  const markerPath = path.join(targetDir, createTargetMarkerName)
  const markerStat = await readStat(markerPath)
  if (!markerStat || markerStat.isSymbolicLink()) {
    result.reason = 'The target ownership marker disappeared or became a symlink during recovery; retained the target for review.'
    return result
  }
  let markerText: string
  try {
    markerText = await readFile(markerPath, 'utf8')
  }
  catch {
    result.reason = 'The target ownership marker changed during recovery; retained the target for review.'
    return result
  }
  let latestMarker: unknown
  try {
    latestMarker = JSON.parse(markerText)
  }
  catch {
    result.reason = 'The target ownership marker changed during recovery; retained the target for review.'
    return result
  }
  if (JSON.stringify(latestMarker) !== JSON.stringify(marker)) {
    result.reason = 'The target ownership marker changed during recovery; retained the target for review.'
    return result
  }
  await unlink(markerPath)
  try {
    await rmdir(targetDir)
    result.targetRemoved = true
  }
  catch (error) {
    if (!['ENOTEMPTY', 'EEXIST'].includes((error as NodeJS.ErrnoException).code ?? '')) {
      throw error
    }
    // The marker was removed just before rmdir. Restore it only when the path
    // is still empty of ownership metadata; a concurrent replacement wins.
    await writeFile(markerPath, markerText, { encoding: 'utf8', flag: 'wx' }).catch((restoreError) => {
      if ((restoreError as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw restoreError
      }
    })
    result.reason = 'The target contains files added during recovery; retained the target for review.'
    return result
  }
  result.removed.push(createTargetMarkerName)
  const latestStaging = await readStat(stagingDir)
  if (!latestStaging || !latestStaging.isDirectory() || latestStaging.isSymbolicLink()
    || latestStaging.dev !== stagingStat.dev || latestStaging.ino !== stagingStat.ino) {
    result.reason = 'Target removed, but the staging directory changed during recovery; retained staging for review.'
    return result
  }
  try {
    // Reuse the identity-checked tombstone cleanup used by create itself. A
    // user or another process may replace the visible staging path after the
    // check above; recursive removal of that path could otherwise delete the
    // replacement directory's contents.
    await removeCreateStaging(stagingDir, stagingStat)
    result.stagingRemoved = !await readStat(stagingDir)
    if (!result.stagingRemoved) {
      result.reason = 'Target removed, but staging cleanup was skipped because the staging path changed; retained staging for review.'
    }
  }
  catch {
    result.reason = 'Target removed, but staging cleanup failed; retained staging for review.'
  }
  return result
}
