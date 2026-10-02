import { TextDecoder } from 'node:util'

export function decodeText(content: Uint8Array | null) {
  if (content?.includes(0)) {
    return null
  }
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(content ?? new Uint8Array())
  }
  catch {
    return null
  }
}

/** One unified hunk, retaining shared context without a quadratic text-diff algorithm. */
export function fileDiff(filename: string, before: Uint8Array | null, after: Uint8Array | null) {
  const left = decodeText(before)
  const right = decodeText(after)
  if (left === null || right === null) {
    return { binary: true, diff: null }
  }
  if ((before?.length ?? 0) + (after?.length ?? 0) > 262144) {
    return { binary: false, diff: null }
  }
  if (left === right) {
    return { binary: false, diff: '' }
  }
  const lines = (text: string) => text ? text.match(/[^\n]*\n|[^\n]+$/g)! : []
  const a = lines(left)
  const b = lines(right)
  let prefix = 0
  let suffix = 0
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) {
    prefix++
  }
  while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - suffix - 1] === b[b.length - suffix - 1]) {
    suffix++
  }
  const start = Math.max(0, prefix - 3)
  const endContext = Math.min(3, suffix)
  const render = (text: string, marker: string) => `${marker}${text.endsWith('\n') ? text.slice(0, -1) : `${text}\n\\ No newline at end of file`}`
  const body = [
    ...a.slice(start, prefix).map(line => render(line, ' ')),
    ...a.slice(prefix, a.length - suffix).map(line => render(line, '-')),
    ...b.slice(prefix, b.length - suffix).map(line => render(line, '+')),
    ...a.slice(a.length - suffix, a.length - suffix + endContext).map(line => render(line, ' ')),
  ]
  const leftCount = a.length - suffix + endContext - start
  const rightCount = b.length - suffix + endContext - start
  return { binary: false, diff: [`--- ${before ? `a/${filename}` : '/dev/null'}`, `+++ ${after ? `b/${filename}` : '/dev/null'}`, `@@ -${leftCount ? start + 1 : 0},${leftCount} +${rightCount ? start + 1 : 0},${rightCount} @@`, ...body].join('\n') }
}
