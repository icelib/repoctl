import type { PeerSpecifier, PeerWorkspacePackage } from './types'
import path from 'node:path'
import { satisfies, valid, validRange } from 'semver'
import { record } from '../files'
import { parseSpecifier } from '../specifiers'

export function resolvePeerSpecifier(name: string, input: string, directory: string, packages: PeerWorkspacePackage[], workspace: Record<string, unknown>): PeerSpecifier {
  let effective = input
  if (input.startsWith('catalog:')) {
    const catalog = input.slice(8)
    const named = record(workspace['catalogs'])
    const isDefault = !catalog || catalog === 'default'
    const duplicateDefault = workspace['catalog'] != null && named?.['default'] != null
    const entries = isDefault ? duplicateDefault ? undefined : record(workspace['catalog'] ?? named?.['default']) : record(named?.[catalog])
    const value = entries?.[name]
    if (typeof value === 'string' && !value.startsWith('catalog:')) {
      effective = value
    }
    else {
      return { source: null, range: null, version: null, effective, workspaceMismatch: false }
    }
  }
  const parsed = parseSpecifier(name, effective, workspace)
  const result: PeerSpecifier = { source: parsed.source, range: parsed.range, version: null, effective, workspaceMismatch: false }
  if (parsed.protocol !== 'workspace') {
    return result
  }
  let range = effective.slice(10)
  let source = name
  const alias = /^(@[^/]+\/[^@]+|[^@/]+)@(.+)$/u.exec(range)
  if (alias) {
    source = alias[1]!
    range = alias[2]!
  }
  const relative = range.startsWith('.') || path.isAbsolute(range)
  const candidates = packages.filter(pkg => relative ? pkg.directory === path.resolve(directory, range) : pkg.name === source)
  if (candidates.length !== 1 || !candidates[0]!.version || !valid(candidates[0]!.version)) {
    return result
  }
  const target = candidates[0]!
  const version = target.version!
  const resolved = relative || range === '*' ? version : range === '^' || range === '~' ? `${range}${version}` : range
  return { ...result, source: target.name, range: validRange(resolved), version, workspaceMismatch: !!validRange(resolved) && !satisfies(version, resolved) }
}
