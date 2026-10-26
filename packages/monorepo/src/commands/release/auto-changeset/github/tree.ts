import type { AutoChangesetRevision } from '../types'
import type { AutoChangesetGitHub } from './client'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { record, safePath, sha } from './client'

export interface TreeEntry { path: string, sha: string, type: string, mode: string }
export interface ChangedFile { filename: string, status: string, previousFilename?: string }

export async function readFiles(client: AutoChangesetGitHub, revision: AutoChangesetRevision): Promise<ChangedFile[]> {
  const files = await client.list(`/pulls/${revision.pullRequest}/files`, undefined, 31)
  if (files.length !== revision.changedFiles || new Set(files.map(file => file['filename'])).size !== files.length) {
    throw new Error('Pull request file pagination is incomplete or contains duplicates.')
  }
  return files.map((file) => {
    const filename = safePath(file['filename'])
    const status = file['status']
    if (!['added', 'removed', 'modified', 'renamed', 'copied', 'changed', 'unchanged'].includes(String(status))) {
      throw new Error('Invalid pull request file status.')
    }
    return { filename, status: String(status), ...(status === 'renamed' ? { previousFilename: safePath(file['previous_filename']) } : {}) }
  })
}

export async function readTree(client: AutoChangesetGitHub, commitSha: string) {
  const commit = record(await client.json(`/git/commits/${sha(commitSha)}`))
  if (commit['sha'] !== commitSha) {
    throw new Error('Commit response identity mismatch.')
  }
  const treeSha = sha(record(commit['tree'])['sha'])
  const response = record(await client.json(`/git/trees/${treeSha}?recursive=1`))
  if (response['sha'] !== treeSha || response['truncated'] !== false || !Array.isArray(response['tree'])) {
    throw new Error('GitHub tree is missing, malformed, or truncated.')
  }
  const entries = new Map<string, TreeEntry>()
  for (const value of response['tree']) {
    const entry = record(value)
    const filename = safePath(entry['path'])
    if (entries.has(filename) || typeof entry['type'] !== 'string' || typeof entry['mode'] !== 'string') {
      throw new Error('Invalid or duplicate tree entry.')
    }
    entries.set(filename, { path: filename, sha: sha(entry['sha']), type: entry['type'], mode: entry['mode'] })
  }
  return { sha: treeSha, entries }
}

export async function readBlob(client: AutoChangesetGitHub, entry: TreeEntry) {
  if (entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode)) {
    throw new Error(`Metadata must be a regular file: ${entry.path}.`)
  }
  const blob = record(await client.json(`/git/blobs/${entry.sha}`))
  if (blob['sha'] !== entry.sha || blob['encoding'] !== 'base64' || typeof blob['content'] !== 'string'
    || typeof blob['size'] !== 'number' || blob['size'] > 2 * 1024 * 1024 || blob['size'] < 0) {
    throw new Error(`Incomplete GitHub metadata blob: ${entry.path}.`)
  }
  const encoded = blob['content'].replace(/\s/gu, '')
  const bytes = Buffer.from(encoded, 'base64')
  const hash = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
  if (bytes.length !== blob['size'] || bytes.toString('base64') !== encoded || hash !== entry.sha) {
    throw new Error(`Metadata blob integrity mismatch: ${entry.path}.`)
  }
  return bytes.toString('utf8')
}

export type GitTree = Awaited<ReturnType<typeof readTree>>
