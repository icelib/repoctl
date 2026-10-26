import type { ChangedFile } from './github/tree'
import type { AutoChangesetDecision, AutoChangesetLevel, AutoChangesetPolicy, AutoChangesetRevision } from './types'
import type { MetadataPackage } from './workspace'
// eslint-disable-next-line e18e/ban-dependencies -- Preserve pnpm-compatible package glob semantics across supported Node releases.
import micromatch from 'micromatch'

const priorities = { patch: 0, minor: 1, major: 2 }
const defaultLabels = { 'release:patch': 'patch', 'release:minor': 'minor', 'release:major': 'major', 'release:none': 'none' } as const

export function ownValue<T>(values: Record<string, T> | undefined, key: string): T | undefined {
  return values && Object.hasOwn(values, key) ? values[key] : undefined
}

export function titleType(title: string) {
  return /^([\w-]+)(?:\([^\r\n]*\))?!?:/u.exec(title)?.[1]?.toLowerCase()
}

export function labelLevel(policy: AutoChangesetPolicy, revision: AutoChangesetRevision) {
  const levels = new Set(revision.labels.map(label => ownValue(policy.labels, label) ?? ownValue(defaultLabels, label)).filter(Boolean))
  if (levels.size > 1) {
    throw new Error('Conflicting release labels; select exactly one release level or none.')
  }
  return [...levels][0]
}

export function selectLevel(policy: AutoChangesetPolicy, revision: AutoChangesetRevision): AutoChangesetLevel {
  const explicit = labelLevel(policy, revision)
  if (explicit === 'none') {
    throw new Error('An explicit no-release label cannot generate a changeset.')
  }
  if ((policy.breakingRequiresLabel ?? true) && /^[\w-]+(?:\([^\r\n]*\))?!:/u.test(revision.title) && !explicit) {
    throw new Error('A breaking-change title requires an explicit release level label.')
  }
  const type = titleType(revision.title)
  return explicit ?? (type ? ownValue(policy.titleTypes, type) ?? (type === 'feat' ? 'minor' : undefined) : undefined) ?? policy.defaultLevel ?? 'patch'
}

function matches(value: string, patterns: string[]) {
  return micromatch.isMatch(value, patterns, { dot: true })
}

function owner(filename: string, packages: MetadataPackage[]) {
  return packages.filter(pkg => pkg.directory === '.' || filename.startsWith(`${pkg.directory}/`))
    .sort((a, b) => (b.directory === '.' ? -1 : b.directory.length) - (a.directory === '.' ? -1 : a.directory.length))[0]
}

export function selectPackages(files: ChangedFile[], head: MetadataPackage[], base: MetadataPackage[], policy: AutoChangesetPolicy, level: AutoChangesetLevel) {
  const selections = new Map<string, AutoChangesetDecision>()
  const removed = new Set<string>()
  function select(pkg: MetadataPackage, bump: AutoChangesetLevel, reason: string) {
    const existing = selections.get(pkg.name)
    const selected = existing ?? { name: pkg.name, directory: pkg.directory, level: bump, reasons: [] }
    const changed = !existing || priorities[bump] > priorities[selected.level]
    if (priorities[bump] > priorities[selected.level]) {
      selected.level = bump
    }
    if (!selected.reasons.includes(reason)) {
      selected.reasons.push(reason)
    }
    selections.set(pkg.name, selected)
    return changed
  }
  for (const file of files) {
    for (const filename of [file.filename, ...(file.previousFilename ? [file.previousFilename] : [])]) {
      if (matches(filename, ['.changeset/**', '**/node_modules/**', '**/dist/**', ...(policy.ignorePaths ?? [])])) {
        continue
      }
      const rule = policy.paths?.find(item => matches(filename, item.patterns))
      if (rule?.release === false) {
        continue
      }
      const previous = owner(filename, base)
      const current = owner(filename, head)
      const candidates = rule?.packages
        ? head.filter(pkg => matches(pkg.name, rule.packages!))
        : [current, previous ? head.find(pkg => pkg.name === previous.name) ?? previous : undefined].filter((pkg): pkg is MetadataPackage => Boolean(pkg))
      if (rule?.packages && !candidates.length) {
        throw new Error(`Release path policy selected no workspace packages: ${filename}.`)
      }
      for (const pkg of candidates) {
        if (!head.some(item => item.name === pkg.name)) {
          if (!pkg.private) {
            removed.add(pkg.name)
          }
          continue
        }
        select(pkg, rule?.level ?? level, `path:${filename}`)
      }
    }
  }
  if (removed.size) {
    throw new Error(`Removed public packages require a handwritten intent or explicit no-release decision: ${[...removed].join(', ')}.`)
  }
  let changed = true
  while (changed) {
    changed = false
    for (const link of policy.links ?? []) {
      const sources = [...selections.values()].filter(pkg => matches(pkg.name, link.from))
      for (const source of sources) {
        const fields = link.dependencyFields ?? ['dependencies', 'optionalDependencies', 'peerDependencies']
        for (const pkg of head) {
          const target = (link.to && matches(pkg.name, link.to))
            || (link.dependents && pkg.dependencies.some(dependency => dependency.name === source.name && fields.includes(dependency.field)))
          if (target) {
            changed = select(pkg, !link.level || link.level === 'same' ? source.level : link.level, `linked:${source.name}`) || changed
          }
        }
      }
    }
  }
  return [...selections.values()].filter(pkg => !head.find(item => item.name === pkg.name)!.private).sort((a, b) => a.name.localeCompare(b.name))
}
