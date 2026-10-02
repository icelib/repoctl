import { Buffer } from 'node:buffer'
import { TextDecoder } from 'node:util'
import { diff3Merge } from 'node-diff3'

export interface TextMergeConflict {
  baseStart: number
  baseEnd: number
  base: string
  local: string
  upstream: string
}

export interface TextMergeResult {
  content: Buffer | null
  reason: 'upstream-update' | 'local-changes-preserved' | 'binary-merge-conflict' | 'merge-size-limit' | 'overlapping-merge-conflict' | 'three-way-merge'
  conflicts: TextMergeConflict[]
}

function decode(content: Buffer) {
  if (content.includes(0)) {
    return null
  }
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(content)
  }
  catch {
    return null
  }
}

/** Merge complete lines without normalizing the BOM, line endings or final newline. */
export function mergeText(base: Buffer, local: Buffer, upstream: Buffer): TextMergeResult {
  if (local.equals(upstream) || local.equals(base)) {
    return { content: upstream, reason: 'upstream-update', conflicts: [] }
  }
  if (upstream.equals(base)) {
    return { content: local, reason: 'local-changes-preserved', conflicts: [] }
  }
  if (base.length + local.length + upstream.length > 1048576) {
    return { content: null, reason: 'merge-size-limit', conflicts: [] }
  }
  const texts = [local, base, upstream].map(decode)
  if (texts.includes(null)) {
    return { content: null, reason: 'binary-merge-conflict', conflicts: [] }
  }
  const lines = texts.map(text => [...text!.match(/[^\n]*\n|[^\n]+$/g) ?? []])
  const merged: string[] = []
  const conflicts: TextMergeConflict[] = []
  for (const region of diff3Merge<string>(lines[0]!, lines[1]!, lines[2]!)) {
    if (region.ok) {
      merged.push(...region.ok)
    }
    else if (region.conflict) {
      const { o, oIndex, a, b } = region.conflict
      conflicts.push({ baseStart: oIndex + 1, baseEnd: oIndex + o.length, base: o.join(''), local: a.join(''), upstream: b.join('') })
    }
  }
  return { content: conflicts.length ? null : Buffer.from(merged.join('')), reason: conflicts.length ? 'overlapping-merge-conflict' : 'three-way-merge', conflicts }
}
