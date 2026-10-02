import type { UpgradeMergeDetails } from '../../../types/upgrade'
import { Buffer } from 'node:buffer'
import { diff3Merge } from 'node-diff3'
import { decodeText } from '../plan/diff'
import { hash } from '../plan/files'

/** Merge complete lines, retaining their original line endings and final newline. */
export function mergeRootAsset(base: Buffer, local: Buffer, upstream: Buffer) {
  const details: UpgradeMergeDetails = { baseHash: hash(base), localHash: hash(local), upstreamHash: hash(upstream), conflicts: [] }
  if (local.equals(upstream) || local.equals(base)) {
    return { content: upstream, details, reason: 'upstream-update' }
  }
  if (upstream.equals(base)) {
    return { content: local, details, reason: 'local-changes-preserved' }
  }
  const texts = [local, base, upstream].map(decodeText)
  if (texts.includes(null)) {
    return { content: null, details, reason: 'binary-merge-conflict' }
  }
  // Avoid unbounded diff work on generated or unusually large files.
  if (base.length + local.length + upstream.length > 1048576) {
    return { content: null, details, reason: 'merge-size-limit' }
  }
  const lines: string[][] = texts.map(text => [...text!.match(/[^\n]*\n|[^\n]+$/g) ?? []])
  const regions = diff3Merge<string>(lines[0]!, lines[1]!, lines[2]!)
  const merged: string[] = []
  for (const region of regions) {
    if (region.ok) {
      merged.push(...region.ok)
    }
    else if (region.conflict) {
      const { o, oIndex, a, b } = region.conflict
      details.conflicts.push({ baseStart: oIndex + 1, baseEnd: oIndex + o.length, base: o.join(''), local: a.join(''), upstream: b.join('') })
    }
  }
  return { content: details.conflicts.length ? null : Buffer.from(merged.join('')), details, reason: details.conflicts.length ? 'overlapping-merge-conflict' : 'three-way-merge' }
}
