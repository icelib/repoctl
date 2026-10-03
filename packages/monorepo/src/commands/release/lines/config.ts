import type { ReleaseBranchesConfig, ReleaseBranchRule } from './types'
import semver from 'semver'
import { ReleaseCommandError } from '../errors'

function invalid(field: string): never {
  throw new ReleaseCommandError(`Invalid release branch configuration: ${field}`)
}

function record(value: unknown, fields: string[], field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !fields.includes(key))) {
    invalid(field)
  }
  return value as Record<string, unknown>
}

function string(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value || value.trim() !== value) {
    invalid(field)
  }
  return value
}

function branch(value: unknown, field: string): string {
  const name = string(value, field)
  if (name === 'HEAD' || !/^[a-z\d][\w./-]*$/i.test(name) || name.includes('..') || name.includes('//')
    || name.endsWith('.') || name.endsWith('/') || name.split('/').some(part => part.startsWith('.') || part.endsWith('.lock'))) {
    invalid(field)
  }
  return name
}

function tag(value: unknown, field: string): string {
  const name = string(value, field)
  if (!/^[a-z\d][\w.-]*$/i.test(name) || semver.validRange(name) || name.startsWith('snapshot-')) {
    invalid(field)
  }
  return name
}

function list(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    invalid(field)
  }
  return value
}

export function releasePullRequestHead(rule: ReleaseBranchRule): string {
  // Keep all heads flat: Git cannot store release/pnpm-version and its children together.
  return rule.kind === 'stable' ? 'release/pnpm-version' : `release/pnpm-version-${encodeURIComponent(rule.branch)}`
}

/** Build one deterministic mapping used by planning, preparation, publishing, CI and recovery. */
export function resolveReleaseBranches(input: ReleaseBranchesConfig = {}): ReleaseBranchRule[] {
  const config = record(input, ['stable', 'maintenance', 'prerelease'], 'branches')
  const stable = branch(config['stable'] === undefined ? 'main' : config['stable'], 'branches.stable')
  const maintenance = list(config['maintenance'] === undefined ? [] : config['maintenance'], 'branches.maintenance').map((value, index): ReleaseBranchRule => {
    const field = `branches.maintenance[${index}]`
    const item = record(value, ['branch', 'range', 'tag'], field)
    const range = string(item['range'], `${field}.range`)
    // Maintenance lines must have a finite upper bound; broad latest ownership stays on stable.
    const parsed = semver.validRange(range)
    if (!parsed || !semver.minVersion(range) || parsed === '*' || new semver.Range(range).set.some(set => !set.some(comparator => ['<', '<=', ''].includes(comparator.operator) && comparator.value))) {
      invalid(`${field}.range`)
    }
    const name = branch(item['branch'], `${field}.branch`)
    return { branch: name, kind: 'maintenance', lane: 'main', range, excludedRanges: [], distTag: tag(item['tag'], `${field}.tag`), target: name }
  })
  for (const [index, rule] of maintenance.entries()) {
    if (maintenance.slice(0, index).some(other => semver.intersects(rule.range, other.range))) {
      invalid(`branches.maintenance[${index}].range overlaps another maintenance line`)
    }
  }
  const stableRules: ReleaseBranchRule[] = [{ branch: stable, kind: 'stable', lane: 'main', range: '*', excludedRanges: maintenance.map(item => item.range), distTag: 'latest', target: stable }, ...maintenance]
  const defaults = ['alpha', 'beta', 'rc', 'next'].map(name => ({ branch: name, lane: name, tag: name, target: stable }))
  const prerelease = list(config['prerelease'] === undefined ? defaults : config['prerelease'], 'branches.prerelease').map((value, index): ReleaseBranchRule => {
    const field = `branches.prerelease[${index}]`
    const item = record(value, ['branch', 'lane', 'tag', 'target'], field)
    const target = branch(item['target'] === undefined ? stable : item['target'], `${field}.target`)
    const parent = stableRules.find(rule => rule.branch === target)
    if (!parent) {
      invalid(`${field}.target`)
    }
    const lane = string(item['lane'], `${field}.lane`)
    if (lane === 'main' || !/^[a-z][a-z\d-]*$/i.test(lane)) {
      invalid(`${field}.lane`)
    }
    return { branch: branch(item['branch'], `${field}.branch`), kind: 'prerelease', lane, range: parent.range, excludedRanges: [...parent.excludedRanges], distTag: tag(item['tag'], `${field}.tag`), target }
  })
  const rules = [...stableRules, ...prerelease]
  for (const key of ['branch', 'distTag'] as const) {
    if (new Set(rules.map(rule => rule[key])).size !== rules.length) {
      invalid(`duplicate ${key}`)
    }
  }
  if (new Set(prerelease.map(rule => rule.lane)).size !== prerelease.length) {
    invalid('duplicate prerelease lane')
  }
  if (rules.some(rule => rules.some(other => other.branch.startsWith(`${rule.branch}/`)))) {
    invalid('release branches conflict as Git reference prefixes')
  }
  const heads = stableRules.map(releasePullRequestHead)
  if (rules.some(rule => heads.some(head => rule.branch === head || rule.branch.startsWith(`${head}/`) || head.startsWith(`${rule.branch}/`)))) {
    invalid('release branches conflict with generated pull request heads')
  }
  return rules
}
