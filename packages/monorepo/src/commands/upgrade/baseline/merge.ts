import type { Buffer } from 'node:buffer'
import type { UpgradeMergeDetails } from '../../../types/upgrade'
import { mergeText } from '../../../core/merge-text'
import { hash } from '../plan/files'

/** Merge complete lines, retaining their original line endings and final newline. */
export function mergeRootAsset(base: Buffer, local: Buffer, upstream: Buffer) {
  const { content, reason, conflicts } = mergeText(base, local, upstream)
  const details: UpgradeMergeDetails = { baseHash: hash(base), localHash: hash(local), upstreamHash: hash(upstream), conflicts }
  return { content, details, reason }
}
