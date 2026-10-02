import { lstat, readFile } from 'node:fs/promises'
import { TextDecoder } from 'node:util'
import path from 'pathe'
import { hash, safeFile } from '../deps/files'

export const ownershipFile = '.repoctl/typescript-references.json'
export const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0

export function relativeFile(value: unknown, glob = false): string {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0') || path.isAbsolute(value) || /^[a-z]:/i.test(value) || value.split('/').some(part => !part || part === '.' || part === '..') || (!glob && /[*?[\]{}!]/.test(value))) {
    throw new Error(`Expected a canonical workspace-relative ${glob ? 'pattern' : 'file'}: ${String(value)}`)
  }
  return value
}

export async function exists(root: string, relative: string) {
  // Inspect all existing ancestors, including when the final path does not exist.
  let cursor = root
  for (const component of relativeFile(relative).split('/')) {
    cursor = path.join(cursor, component)
    try {
      const stat = await lstat(cursor)
      if (stat.isSymbolicLink() || (cursor !== path.join(root, relative) && !stat.isDirectory())) {
        throw new Error(`Linked or unsupported project reference path: ${relative}`)
      }
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false
      }
      throw error
    }
  }
  return true
}

export async function readText(root: string, relative: string, inputs?: Record<string, string>) {
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await readFile(await safeFile(root, relative)))
  if (inputs) {
    inputs[relative] = hash(text)
  }
  return text
}

export function referenceTarget(source: string, reference: string) {
  if (!reference || reference.includes('\\') || path.isAbsolute(reference) || /^[a-z]:/i.test(reference)) {
    throw new Error(`Unsupported project reference: ${reference}`)
  }
  const resolved = path.normalize(path.join(path.dirname(source), reference))
  return relativeFile(resolved.endsWith('.json') ? resolved : path.join(resolved, 'tsconfig.json'))
}

export function referencePath(source: string, target: string) {
  const relative = path.relative(path.dirname(source), target)
  return relative.startsWith('.') ? relative : `./${relative}`
}
