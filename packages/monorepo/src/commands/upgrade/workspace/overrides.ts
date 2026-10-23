import type { UpgradeOverrideFinding } from '../../../types/upgrade'
import type { DependencyScan } from '../../deps/scan'
import { intersects, subset, validRange } from 'semver'
import { matchGroup } from '../../deps/policy'
import { parseSpecifier } from '../../deps/specifiers'
import { overrideFingerprint } from './decisions'

/** Nested parent selectors need a resolved dependency graph; never guess their scope. */
function parseSelector(selector: string) {
  const match = /^((?:@[\w.~-]+\/)?[\w.~-]+)(?:@(.+))?$/.exec(selector)
  if (!match || (match[2] && !validRange(match[2]))) {
    return null
  }
  return { name: match[1]!, range: match[2] ?? '*' }
}

function nestedChild(selector: string) {
  for (let index = 0; index < selector.length; index++) {
    if (selector[index] === '>' && parseSelector(selector.slice(0, index))) {
      const child = parseSelector(selector.slice(index + 1))
      if (child) {
        return child
      }
    }
  }
  return null
}

export function inspectOverride(selector: string, upstream: Record<string, unknown>, local: Record<string, unknown>, scan: DependencyScan): UpgradeOverrideFinding {
  const finding: UpgradeOverrideFinding = {
    path: ['overrides', selector],
    status: 'compatible',
    detail: 'The new override stays within the inspected dependency declarations and existing selector boundaries.',
    upstreamHash: overrideFingerprint(upstream, selector),
    localHash: overrideFingerprint(local, selector),
    affected: [],
  }
  const selected = parseSelector(selector)
  const value = upstream[selector]
  const replacement = selected && typeof value === 'string' ? parseSpecifier(selected.name, value, scan.workspace) : null
  const reasons = new Set<string>()
  if (!selected || !replacement?.range || replacement.source !== selected.name) {
    finding.status = 'unverified'
    finding.detail = 'The override selector or replacement cannot be compared safely. Review it explicitly; nested selectors and non-semver replacements are not inferred.'
    return finding
  }
  for (const [existing, specifier] of Object.entries(local)) {
    if (existing === selector) {
      continue
    }
    const parsed = parseSelector(existing)
    const child = parsed ? null : nestedChild(existing)
    if (parsed?.name === selected.name && intersects(selected.range, parsed.range) && !subset(selected.range, parsed.range)) {
      reasons.add('The new selector expands an existing local override boundary.')
      finding.affected.push({ path: 'pnpm-workspace.yaml', section: `overrides[${JSON.stringify(existing)}]`, specifier: String(specifier) })
    }
    else if (child?.name === selected.name && intersects(selected.range, child.range)) {
      reasons.add('An existing parent-qualified override requires explicit scope review.')
      finding.affected.push({ path: 'pnpm-workspace.yaml', section: `overrides[${JSON.stringify(existing)}]`, specifier: String(specifier) })
    }
  }
  for (const occurrence of scan.occurrences) {
    if (occurrence.name !== selected.name && occurrence.source !== selected.name) {
      continue
    }
    if (occurrence.range && !intersects(selected.range, occurrence.range)) {
      continue
    }
    const group = matchGroup(occurrence, scan.policy)
    finding.affected.push({ path: occurrence.path, section: `${occurrence.section}.${occurrence.name}`, specifier: occurrence.specifier, group: group?.name ?? 'default', ...group ? { reason: group.reason } : {} })
    if (!occurrence.range || occurrence.source !== selected.name) {
      reasons.add('A matching dependency declaration cannot be compared safely.')
    }
    else if (!subset(replacement.range, occurrence.range)) {
      reasons.add('The replacement can escape a matching dependency declaration, including intentional version groups.')
    }
  }
  if (reasons.size) {
    finding.status = 'conflict'
    finding.detail = [...reasons].join(' ')
  }
  return finding
}
