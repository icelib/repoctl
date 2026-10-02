import type { UpgradeDiff } from './types'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'

const MAX_DIFF_BYTES = 16 * 1024
const MAX_DIFF_LINES = 400

function hash(content: Buffer | undefined) {
  return content === undefined ? null : createHash('sha256').update(content).digest('hex')
}

function isBinary(content: Buffer | undefined) {
  return content?.includes(0) ?? false
}

function splitLines(content: Buffer | undefined) {
  if (content === undefined) {
    return []
  }
  const text = content.toString('utf8')
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
}

function lineCount(lines: string[]) {
  return lines.length && lines.at(-1) === '' ? lines.length - 1 : lines.length
}

function createTextDiff(path: string, before: Buffer | undefined, after: Buffer | undefined, beforeLines: string[], afterLines: string[], includeText: boolean): UpgradeDiff {
  let prefix = 0
  while (prefix < beforeLines.length && prefix < afterLines.length && beforeLines[prefix] === afterLines[prefix]) {
    prefix++
  }
  let suffix = 0
  while (
    suffix < beforeLines.length - prefix
    && suffix < afterLines.length - prefix
    && beforeLines[beforeLines.length - suffix - 1] === afterLines[afterLines.length - suffix - 1]
  ) {
    suffix++
  }

  const changedBefore = beforeLines.slice(prefix, beforeLines.length - suffix)
  const changedAfter = afterLines.slice(prefix, afterLines.length - suffix)
  const diffLines = [
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -${prefix + 1},${changedBefore.length} +${prefix + 1},${changedAfter.length} @@`,
    ...changedBefore.map(line => `-${line}`),
    ...changedAfter.map(line => `+${line}`),
  ]
  const fullText = diffLines.join('\n')
  const truncated = diffLines.length > MAX_DIFF_LINES || Buffer.byteLength(fullText) > MAX_DIFF_BYTES
  const text = includeText
    ? Buffer.from(diffLines.slice(0, MAX_DIFF_LINES).join('\n')).subarray(0, MAX_DIFF_BYTES).toString('utf8')
    : undefined

  return {
    kind: 'text',
    beforeBytes: before?.byteLength ?? 0,
    afterBytes: after?.byteLength ?? 0,
    beforeHash: hash(before),
    afterHash: hash(after),
    addedLines: lineCount(changedAfter),
    deletedLines: lineCount(changedBefore),
    truncated,
    ...(text === undefined ? {} : { text }),
  }
}

/**
 * Create a bounded, machine-readable preview for an upgrade operation.
 * Full file contents are only included when explicitly requested by `--diff`.
 */
export function createUpgradeDiff(path: string, before: Buffer | undefined, after: Buffer | undefined, includeText = false): UpgradeDiff {
  const beforeBytes = before?.byteLength ?? 0
  const afterBytes = after?.byteLength ?? 0
  if (isBinary(before) || isBinary(after)) {
    return {
      kind: 'binary',
      beforeBytes,
      afterBytes,
      beforeHash: hash(before),
      afterHash: hash(after),
      addedLines: 0,
      deletedLines: 0,
      truncated: false,
    }
  }
  return createTextDiff(path, before, after, splitLines(before), splitLines(after), includeText)
}
