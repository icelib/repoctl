import type { Stats } from 'node:fs'
import type { CreateTargetMarker } from '../index'
import { lstat, readFile, writeFile } from 'node:fs/promises'
import path from 'pathe'
import { samePath } from '../paths'

export const createManifestRecoveryName = '.repoctl-create-manifest.json'

export interface FileIdentity {
  dev: number
  ino: number
  size: number
  mtimeMs: number
}

interface RecordBase {
  schemaVersion: 1
  cwd: string
  targetDir: string
  stagingDir: string
}

export type CreateManifestRecord = RecordBase & ({
  kind: 'unchanged'
} | {
  kind: 'change'
  original: string | null
  expected: string
  published: FileIdentity
  originalMode?: number
})

export interface ManifestRecordSnapshot {
  value: CreateManifestRecord
  text: string
  identity: FileIdentity
}

export interface WriteCreateManifestRecoveryOptions {
  cwd: string
  targetDir: string
  original: string | null
  expected: string | null
  changed: boolean
  stagedManifest: string
}

export function fileIdentity(stat: Stats): FileIdentity {
  return { dev: stat.dev, ino: stat.ino, size: stat.size, mtimeMs: stat.mtimeMs }
}

export function sameFileIdentity(left: FileIdentity, right: FileIdentity) {
  return left.dev !== 0 && left.ino !== 0
    && left.dev === right.dev && left.ino === right.ino
    && left.size === right.size && left.mtimeMs === right.mtimeMs
}

function isIdentity(value: unknown): value is FileIdentity {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const stat = value as Partial<FileIdentity>
  return typeof stat.dev === 'number' && Number.isFinite(stat.dev)
    && typeof stat.ino === 'number' && Number.isFinite(stat.ino)
    && typeof stat.size === 'number' && Number.isSafeInteger(stat.size) && stat.size >= 0
    && typeof stat.mtimeMs === 'number' && Number.isFinite(stat.mtimeMs)
}

function isRecord(value: unknown): value is CreateManifestRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const record = value as Partial<RecordBase> & {
    kind?: unknown
    original?: unknown
    expected?: unknown
    published?: unknown
    originalMode?: unknown
  }
  if (record.schemaVersion !== 1 || typeof record.cwd !== 'string'
    || typeof record.targetDir !== 'string' || typeof record.stagingDir !== 'string') {
    return false
  }
  if (record.kind === 'unchanged') {
    return true
  }
  return record.kind === 'change'
    && (record.original === null || typeof record.original === 'string')
    && typeof record.expected === 'string'
    && isIdentity(record.published)
    && (record.originalMode === undefined || (typeof record.originalMode === 'number'
      && Number.isInteger(record.originalMode) && record.originalMode >= 0 && record.originalMode <= 0o777))
}

export async function writeCreateManifestRecovery(stagingDir: string, options: WriteCreateManifestRecoveryOptions) {
  const base: RecordBase = {
    schemaVersion: 1,
    cwd: options.cwd,
    targetDir: options.targetDir,
    stagingDir,
  }
  let record: CreateManifestRecord = { ...base, kind: 'unchanged' }
  if (options.changed) {
    if (typeof options.expected !== 'string') {
      throw new TypeError('A changed workspace manifest requires its expected content.')
    }
    const published = await lstat(options.stagedManifest)
    if (!published.isFile() || published.isSymbolicLink()) {
      throw new Error('The staged workspace manifest must be a regular file.')
    }
    let originalMode: number | undefined
    if (options.original !== null) {
      const original = await lstat(path.join(options.cwd, 'pnpm-workspace.yaml'))
      if (!original.isFile() || original.isSymbolicLink()) {
        throw new Error('The original workspace manifest must be a regular file.')
      }
      originalMode = original.mode & 0o777
    }
    record = {
      ...base,
      kind: 'change',
      original: options.original,
      expected: options.expected,
      published: fileIdentity(published),
      ...(originalMode !== undefined ? { originalMode } : {}),
    }
  }
  await writeFile(path.join(stagingDir, createManifestRecoveryName), `${JSON.stringify(record)}\n`, { encoding: 'utf8', flag: 'wx' })
}

export async function readManifestRecord(marker: CreateTargetMarker): Promise<ManifestRecordSnapshot> {
  const staging = await lstat(marker.stagingDir)
  if (!staging.isDirectory() || staging.isSymbolicLink()) {
    throw new Error('The create staging directory is not a real directory.')
  }
  const recordPath = path.join(marker.stagingDir, createManifestRecoveryName)
  const before = await lstat(recordPath)
  if (!before.isFile() || before.isSymbolicLink()) {
    throw new Error('The manifest recovery record is not a regular file.')
  }
  const text = await readFile(recordPath, 'utf8')
  const after = await lstat(recordPath)
  if (!after.isFile() || after.isSymbolicLink() || !sameFileIdentity(fileIdentity(before), fileIdentity(after))) {
    throw new Error('The manifest recovery record changed while being inspected.')
  }
  const value: unknown = JSON.parse(text)
  if (!isRecord(value) || !await samePath(value.cwd, marker.cwd)
    || !await samePath(value.targetDir, marker.targetDir)
    || !await samePath(value.stagingDir, marker.stagingDir)) {
    throw new Error('The manifest recovery record does not match this create transaction.')
  }
  return { value, text, identity: fileIdentity(after) }
}
