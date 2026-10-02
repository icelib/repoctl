import type { DependencyProtocol } from '../../types/dependencies'
import { minVersion, Range, satisfies, subset, validRange } from 'semver'
import { record } from './files'

export interface ParsedSpecifier {
  protocol: DependencyProtocol
  source: string | null
  range: string | null
}

export function parseSpecifier(name: string, specifier: string, workspace: Record<string, unknown> = {}): ParsedSpecifier {
  const numeric = specifier.trim() ? validRange(specifier) : null
  if (numeric) {
    return { protocol: 'semver', source: name, range: numeric }
  }
  if (specifier.startsWith('npm:')) {
    const alias = /^npm:((?:@[^/@]+\/)?[^/@]+)@(.+)$/.exec(specifier)
    return { protocol: 'npm', source: alias?.[1] ?? null, range: alias?.[2] ? validRange(alias[2]) : null }
  }
  if (specifier.startsWith('catalog:')) {
    const catalog = specifier.slice(8)
    const entries = catalog ? record(record(workspace['catalogs'])?.[catalog]) : record(workspace['catalog'])
    const value = entries?.[name]
    const parsed = typeof value === 'string' && !value.startsWith('catalog:') ? parseSpecifier(name, value) : undefined
    return { protocol: 'catalog', source: parsed?.source ?? null, range: parsed?.range ?? null }
  }
  const protocol: DependencyProtocol = specifier.startsWith('workspace:')
    ? 'workspace'
    : specifier.startsWith('file:')
      ? 'file'
      : specifier.startsWith('link:')
        ? 'link'
        : /^(?:git(?:\+[^:]+)?:|github:|gitlab:|bitbucket:|git@)/.test(specifier)
          ? 'git'
          : /^https?:/.test(specifier) ? 'url' : 'unknown'
  return { protocol, source: null, range: null }
}

export function equivalentRanges(ranges: string[]) {
  return ranges.every(range => subset(range, ranges[0]!) && subset(ranges[0]!, range))
}

/** Intersect OR branches, rather than mistaking pairwise overlap for a common range. */
export function rangesOverlap(ranges: string[]): boolean | undefined {
  let branches = ['*']
  for (const range of ranges) {
    const alternatives = new Range(range).set.map(set => set.map(comparator => comparator.value).join(' ') || '*')
    if (branches.length * alternatives.length > 256) {
      return undefined
    }
    branches = branches.flatMap(left => alternatives.map(right => `${left} ${right}`)).filter(branch => minVersion(branch) !== null)
  }
  return branches.some((branch) => {
    const minimum = minVersion(branch)
    if (!minimum) {
      return false
    }
    const candidates = [minimum.version, `${minimum.major}.${minimum.minor}.${minimum.patch}`]
    return candidates.some(candidate => ranges.every(range => satisfies(candidate, range)))
  })
}
