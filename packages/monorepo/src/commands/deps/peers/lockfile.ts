import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { satisfies, valid } from 'semver'
import { parseAllDocuments } from 'yaml'
import { record } from '../files'

export async function readPeerLockfile(root: string) {
  try {
    const documents = parseAllDocuments(await readFile(path.join(root, 'pnpm-lock.yaml'), 'utf8'))
    if (documents.some(doc => doc.errors.length)) {
      return { state: 'unsupported' as const }
    }
    const candidates = documents.map(doc => record(doc.toJSON())).filter((doc) => {
      const importers = record(doc?.['importers'])
      return importers && Object.values(importers).some(value => ['dependencies', 'devDependencies', 'optionalDependencies'].some(section => record(value)?.[section] !== undefined))
    })
    if (candidates.length !== 1 || Number(candidates[0]!['lockfileVersion']) !== 9) {
      return { state: 'unsupported' as const }
    }
    return { state: 'supported' as const, importers: record(candidates[0]!['importers'])! }
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { state: 'absent' as const }
    }
    return { state: 'unsupported' as const }
  }
}

export function lockedPeerVersion(lock: Awaited<ReturnType<typeof readPeerLockfile>>, directory: string, name: string, specifiers: string[], source: string, range: string) {
  if (lock.state !== 'supported') {
    return { state: lock.state }
  }
  const entry = record(record(record(lock.importers[directory])?.['devDependencies'])?.[name])
  if (!entry || typeof entry['specifier'] !== 'string' || !specifiers.includes(entry['specifier']) || typeof entry['version'] !== 'string') {
    return { state: 'stale' as const }
  }
  let version = entry['version'].split('(')[0]!
  if (version.startsWith(`${source}@`)) {
    version = version.slice(source.length + 1)
  }
  if (!valid(version)) {
    return { state: 'unsupported' as const }
  }
  if (!satisfies(version, range)) {
    return { state: 'stale' as const }
  }
  return { state: 'observed' as const, version }
}
