import type { CreateTargetMarker } from './index'
import { readFile } from 'node:fs/promises'
import path from 'pathe'
import { readStat } from './compare'
import { createStagingMarkerName } from './index'
import { samePath } from './paths'

interface CreateStagingMarker {
  schemaVersion: 1 | 2
  pid: number
  cwd: string
  targetDir: string
  createdAt: number
}

function isCreateStagingMarker(value: unknown): value is CreateStagingMarker {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const marker = value as Partial<CreateStagingMarker>
  return (marker.schemaVersion === 1 || marker.schemaVersion === 2)
    && typeof marker.pid === 'number'
    && Number.isSafeInteger(marker.pid)
    && marker.pid > 0
    && typeof marker.cwd === 'string'
    && typeof marker.targetDir === 'string'
    && typeof marker.createdAt === 'number'
    && Number.isFinite(marker.createdAt)
}

/** Return the staging marker path only when it belongs to the target marker. */
export async function readMatchingStagingMarker(marker: CreateTargetMarker) {
  const markerPath = path.join(path.resolve(marker.stagingDir), createStagingMarkerName)
  const stat = await readStat(markerPath)
  if (!stat || !stat.isFile() || stat.isSymbolicLink()) {
    return undefined
  }
  let value: unknown
  try {
    value = JSON.parse(await readFile(markerPath, 'utf8'))
  }
  catch {
    return undefined
  }
  if (!isCreateStagingMarker(value)) {
    return undefined
  }
  if (!await samePath(value.cwd, marker.cwd)
    || !await samePath(value.targetDir, marker.targetDir)
    || value.schemaVersion !== marker.schemaVersion
    || value.pid !== marker.pid) {
    return undefined
  }
  return markerPath
}
