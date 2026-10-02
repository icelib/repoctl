import type { execFileSync } from 'node:child_process'
import process from 'node:process'
import { readChangedPaths } from '../git'

export interface PushCommit {
  commit: string
  /** Remote ref names receiving this commit, in hook input order. */
  refs: string[]
  /** Paths relative to the Git root, including both sides of renames. */
  changedFiles: string[]
}

interface PushUpdate {
  localRef: string
  localSha: string
  remoteRef: string
  remoteSha: string
}

const objectIdPattern = /^(?:[a-f\d]{40}|[a-f\d]{64})$/i
const deletedObjectPattern = /^0+$/

function hasControlCharacter(value: string) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code <= 32 || code === 127
  })
}

function parsePushUpdates(stdinText: string): PushUpdate[] {
  const updates: PushUpdate[] = []
  for (const [index, line] of stdinText.split(/\r?\n/).entries()) {
    // Git ref names can contain Unicode whitespace. The hook protocol uses
    // ASCII separators, so a generic trim()/\s/ would corrupt valid names.
    const trimmed = line.replace(/^[\t ]+|[\t ]+$/g, '')
    if (!trimmed) {
      continue
    }
    const fields = trimmed.split(/[\t ]+/)
    if (fields.length !== 4) {
      throw new Error(`Invalid pre-push input at line ${index + 1}: expected four fields.`)
    }
    const [localRef, localSha, remoteRef, remoteSha] = fields as [string, string, string, string]
    if (!objectIdPattern.test(localSha) || !objectIdPattern.test(remoteSha)) {
      throw new Error(`Invalid pre-push input at line ${index + 1}: object IDs must be 40 or 64 hexadecimal characters.`)
    }
    if (hasControlCharacter(localRef) || hasControlCharacter(remoteRef)) {
      throw new Error(`Invalid pre-push input at line ${index + 1}: ref names contain a control character.`)
    }
    if (!deletedObjectPattern.test(localSha)) {
      updates.push({ localRef, localSha: localSha.toLowerCase(), remoteRef, remoteSha: remoteSha.toLowerCase() })
    }
  }
  return updates
}

/** Plan verification against each distinct pushed commit, without using HEAD. */
export function planPushCommits(stdinText: string, gitRoot: string, execFile: typeof execFileSync): PushCommit[] {
  // Parse all lines before invoking Git so malformed later records cannot
  // silently leave the caller with a partially planned push.
  const updates = parsePushUpdates(stdinText)
  // Local replacement refs are not pushed or copied into the verification
  // clone. Plan against the original objects that the remote will receive.
  const environment = { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' }
  const commits = new Map<string, string>()
  const groups = new Map<string, { refs: Set<string>, paths: Set<string> }>()
  const compared = new Set<string>()
  let emptyTree: string | undefined

  const resolveCommit = (sha: string, label: string) => {
    const cached = commits.get(sha)
    if (cached) {
      return cached
    }
    let commit: string
    try {
      commit = execFile('git', ['rev-parse', '--verify', '--end-of-options', `${sha}^{commit}`], {
        cwd: gitRoot,
        env: environment,
        encoding: 'utf8',
      }).trim()
      if (!objectIdPattern.test(commit)) {
        throw new Error('Git returned an invalid commit object ID.')
      }
    }
    catch (error) {
      throw new Error(`Cannot verify ${label}: ${sha} does not resolve to a commit.`, { cause: error })
    }
    commits.set(sha, commit)
    return commit
  }

  for (const update of updates) {
    const commit = resolveCommit(update.localSha, `pushed ref ${update.localRef} -> ${update.remoteRef}`)
    let base: string
    if (deletedObjectPattern.test(update.remoteSha)) {
      emptyTree ??= execFile('git', ['hash-object', '-t', 'tree', '--stdin'], {
        cwd: gitRoot,
        env: environment,
        encoding: 'utf8',
        input: '',
      }).trim()
      if (!objectIdPattern.test(emptyTree)) {
        throw new Error('Cannot verify new remote refs: Git returned an invalid empty tree object ID.')
      }
      base = emptyTree
    }
    else {
      base = resolveCommit(update.remoteSha, `remote base of ${update.remoteRef}`)
    }
    let group = groups.get(commit)
    if (!group) {
      group = { refs: new Set(), paths: new Set() }
      groups.set(commit, group)
    }
    group.refs.add(update.remoteRef)
    const comparison = `${base}:${commit}`
    if (base === commit || compared.has(comparison)) {
      continue
    }
    const output = execFile('git', ['diff', '--name-status', '-z', '--find-renames', '--no-relative', base, commit, '--'], {
      cwd: gitRoot,
      env: environment,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    })
    compared.add(comparison)
    for (const file of readChangedPaths(output)) {
      group.paths.add(file)
    }
  }
  return [...groups].map(([commit, group]) => ({
    commit,
    refs: [...group.refs],
    changedFiles: [...group.paths],
  }))
}
