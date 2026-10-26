import type { ReleasePreparationValidationOptions } from './types'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import crossSpawn from 'cross-spawn'

export interface TreeEntry { mode: string, oid: string }
export type GitTree = Map<string, TreeEntry>
export type GitOptions = Pick<ReleasePreparationValidationOptions, 'cwd' | 'spawn' | 'env'>

export function safePath(filename: string) {
  return Boolean(filename) && !filename.includes('\\') && !filename.includes('\0')
    && !filename.startsWith('/') && !/^[a-z]:/i.test(filename)
    && filename.split('/').every(part => part !== '' && part !== '.' && part !== '..' && part.toLowerCase() !== '.git')
}

function git(args: string[], options: GitOptions) {
  const result = (options.spawn ?? crossSpawn.sync)('git', ['-c', 'core.fsmonitor=false', ...args], {
    cwd: options.cwd,
    env: { ...(options.env ?? process.env), GIT_OPTIONAL_LOCKS: '0', GIT_NO_REPLACE_OBJECTS: '1' },
    encoding: 'buffer',
    shell: false,
    timeout: 60000,
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.error || result.status !== 0) {
    throw new Error(`Cannot read frozen Git metadata: ${result.error?.message ?? result.stderr?.toString().trim() ?? result.status}`)
  }
  return Buffer.from(result.stdout ?? '')
}

export function readTree(revision: string, options: GitOptions): GitTree {
  if (!/^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(revision)
    || git(['rev-parse', '--verify', `${revision}^{commit}`], options).toString().trim() !== revision.toLowerCase()) {
    throw new Error('Release validation requires full immutable commit IDs.')
  }
  const entries = git(['ls-tree', '-rz', '--full-tree', revision], options).toString().split('\0').filter(Boolean)
  return new Map(entries.map((entry) => {
    const match = /^(\d+) \w+ ([a-f\d]+)\t([\s\S]+)$/.exec(entry)
    if (!match || !safePath(match[3]!)) {
      throw new Error('Unsafe file path in frozen Git tree.')
    }
    return [match[3]!, { mode: match[1]!, oid: match[2]! }]
  }))
}

export function readBlob(entry: TreeEntry, options: GitOptions) {
  if (entry.mode !== '100644' && entry.mode !== '100755') {
    throw new Error('Release validation only accepts regular metadata and generated files.')
  }
  return git(['cat-file', 'blob', entry.oid], options)
}

/** Read policy as data from the trusted frozen base, without loading checkout configuration. */
export function readReleasePreparationPolicy(options: GitOptions & { base: string, path: string }): unknown {
  if (!safePath(options.path)) {
    throw new Error('Policy must be a safe repository-relative JSON path.')
  }
  const entry = readTree(options.base, options).get(options.path)
  if (!entry) {
    throw new Error(`Release validation policy is missing from the frozen base: ${options.path}`)
  }
  return JSON.parse(readBlob(entry, options).toString())
}
