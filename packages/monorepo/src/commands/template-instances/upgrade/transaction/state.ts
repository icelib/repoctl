import type { TemplateUpgradeEntry } from '../types'
import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import process from 'node:process'
import { safeInstancePath } from '@icebreakers/monorepo-templates'
import { sameEntry } from '../changes'

export interface UpgradeFileState {
  entry: TemplateUpgradeEntry
  mode: number
  atimeMs: number
  mtimeMs: number
}

export interface UpgradeOperation {
  path: string
  before: UpgradeFileState | null
  after: UpgradeFileState | null
}

export async function readUpgradeFileState(root: string, relative: string): Promise<UpgradeFileState | null> {
  const filename = await safeInstancePath(root, relative)
  try {
    const stat = await fs.lstat(filename)
    if (!stat.isFile() && !stat.isDirectory()) {
      throw new Error(`Unsupported template upgrade path: ${relative}`)
    }
    const entry: TemplateUpgradeEntry = stat.isDirectory() ? { kind: 'directory' } : { kind: 'file', content: (await fs.readFile(filename)).toString('base64'), executable: (stat.mode & 0o111) !== 0 }
    return { entry, mode: stat.mode & 0o777, atimeMs: stat.atimeMs, mtimeMs: stat.mtimeMs }
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw error
  }
}

export function stateMatches(left: UpgradeFileState | null, right: UpgradeFileState | null) {
  return sameEntry(left?.entry ?? null, right?.entry ?? null) && left?.mode === right?.mode
}

export function desiredUpgradeState(entry: TemplateUpgradeEntry | null, before: UpgradeFileState | null): UpgradeFileState | null {
  if (!entry) {
    return null
  }
  // Windows exposes read-only state, but does not implement POSIX executable or group bits.
  if (process.platform === 'win32') {
    const normalized = entry.kind === 'file' ? { ...entry, executable: false } : entry
    const now = Date.now()
    return { entry: normalized, mode: before?.mode ?? (entry.kind === 'directory' ? 0o777 : 0o666), atimeMs: now, mtimeMs: now }
  }
  let mode = before?.mode ?? ((entry.kind === 'directory' || entry.executable ? 0o755 : 0o644) & ~process.umask())
  if (entry.kind === 'file' && before?.entry.kind === 'file' && entry.executable !== before.entry.executable) {
    mode = entry.executable ? mode | ((mode & 0o444) >> 2) | 0o100 : mode & ~0o111
  }
  const now = Date.now()
  return { entry, mode, atimeMs: now, mtimeMs: now }
}

export function validateUpgradeFileState(state: UpgradeFileState | null) {
  if (state === null) {
    return
  }
  if (!state || !Number.isInteger(state.mode) || state.mode < 0 || state.mode > 0o777
    || !Number.isFinite(state.atimeMs) || !Number.isFinite(state.mtimeMs)
    || !state.entry || !['directory', 'file'].includes(state.entry.kind)) {
    throw new Error('Invalid template upgrade recovery file metadata.')
  }
  if (state.entry.kind === 'file' && (typeof state.entry.content !== 'string' || typeof state.entry.executable !== 'boolean'
    || Buffer.from(state.entry.content, 'base64').toString('base64') !== state.entry.content || ((state.mode & 0o111) !== 0) !== state.entry.executable)) {
    throw new Error('Invalid template upgrade recovery file content.')
  }
}
