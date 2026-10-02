import type { TemplateSnapshot } from '@icebreakers/monorepo-templates'
import type { TemplateUpgradeChange, TemplateUpgradeEntry } from './types'
import { Buffer } from 'node:buffer'
import { mergeText } from '../../../core/merge-text'

export function snapshotEntries(snapshot: TemplateSnapshot) {
  const result = new Map<string, TemplateUpgradeEntry>()
  for (const directory of snapshot.directories) {
    result.set(directory, { kind: 'directory' })
  }
  for (const file of snapshot.files) {
    result.set(file.path, { kind: 'file', content: file.content, executable: file.executable })
  }
  return result
}

export function sameEntry(left: TemplateUpgradeEntry | null, right: TemplateUpgradeEntry | null) {
  if (!left || !right) {
    return left === right
  }
  return left.kind === right.kind && (left.kind === 'directory' || (right.kind === 'file' && left.content === right.content && left.executable === right.executable))
}

function change(filename: string, base: TemplateUpgradeEntry | null, local: TemplateUpgradeEntry | null, upstream: TemplateUpgradeEntry | null, excluded: boolean): TemplateUpgradeChange {
  const result = (after: TemplateUpgradeEntry | null, status: TemplateUpgradeChange['status'], reason: string): TemplateUpgradeChange => ({ path: filename, before: local, after, status, reason })
  const preserve = (reason: string) => result(local, 'preserved', reason)
  const conflict = (reason: string) => result(local, 'conflict', reason)
  const adopt = () => result(upstream, sameEntry(local, upstream) ? 'unchanged' : local ? 'modify' : 'add', 'upstream-update')
  if (excluded) {
    return preserve('excluded-path')
  }
  if (!base) {
    return !upstream ? preserve('business-file') : !local || sameEntry(local, upstream) ? adopt() : conflict('upstream-addition-collision')
  }
  if (!local) {
    return preserve('user-deletion-preserved')
  }
  if (!upstream) {
    if (base.kind === 'directory' && local.kind === 'directory') {
      return preserve('directory-preserved')
    }
    return sameEntry(local, base) ? result(null, 'delete', 'upstream-file-removed') : conflict('upstream-removal-conflict')
  }
  if (sameEntry(base, upstream)) {
    return sameEntry(local, upstream) ? adopt() : preserve('local-changes-preserved')
  }
  if (local.kind !== upstream.kind || base.kind !== upstream.kind) {
    return conflict('entry-type-conflict')
  }
  if (sameEntry(local, base) || sameEntry(local, upstream)) {
    return adopt()
  }
  if (base.kind === 'file' && local.kind === 'file' && upstream.kind === 'file') {
    const merged = mergeText(Buffer.from(base.content, 'base64'), Buffer.from(local.content, 'base64'), Buffer.from(upstream.content, 'base64'))
    if (!merged.content) {
      return { ...conflict(merged.reason), conflicts: merged.conflicts }
    }
    const after: TemplateUpgradeEntry = { kind: 'file', content: merged.content.toString('base64'), executable: local.executable === base.executable ? upstream.executable : local.executable }
    return result(after, sameEntry(local, after) ? 'unchanged' : 'modify', merged.reason)
  }
  return adopt()
}

export function computeTemplateUpgradeChanges(base: TemplateSnapshot, local: TemplateSnapshot, upstream: TemplateSnapshot, excluded: string[]) {
  const oldEntries = snapshotEntries(base)
  const current = snapshotEntries(local)
  const next = snapshotEntries(upstream)
  const paths = [...new Set([...oldEntries.keys(), ...next.keys()])].sort()
  const changes = paths.map(filename => change(filename, oldEntries.get(filename) ?? null, current.get(filename) ?? null, next.get(filename) ?? null, excluded.some(prefix => filename === prefix || filename.startsWith(`${prefix}/`))))
  const byPath = new Map(changes.map(item => [item.path, item]))
  const desired = new Map<string, TemplateUpgradeEntry | null>(current)
  for (const item of changes) {
    desired.set(item.path, item.after)
  }
  for (const item of changes) {
    // A preserved parent deletion or business file must not be recreated as a side effect.
    let parent = item.path
    while (parent.includes('/')) {
      parent = parent.slice(0, parent.lastIndexOf('/'))
      if (item.after && desired.get(parent)?.kind !== 'directory') {
        item.status = (oldEntries.has(parent) && !current.has(parent)) || byPath.get(parent)?.reason === 'user-deletion-preserved' ? 'preserved' : 'conflict'
        item.reason = item.status === 'preserved' ? 'user-deletion-preserved' : 'parent-type-conflict'
        item.after = item.before
        desired.set(item.path, item.after)
        break
      }
    }
  }
  return changes
}
