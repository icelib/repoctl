import type { AutoChangesetPolicy } from '../types'
import { record } from '../github/client'

const levels = ['patch', 'minor', 'major']

function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) {
    throw new Error('Unknown auto changeset policy property.')
  }
}

function strings(value: unknown, label: string) {
  if (!Array.isArray(value) || value.length === 0 || value.some(item => typeof item !== 'string' || !item || /[\0\r\n]/u.test(item))) {
    throw new Error(`Invalid auto changeset policy ${label}.`)
  }
}

function optionalEnum(value: unknown, allowed: unknown[]) {
  if (value !== undefined && !allowed.includes(value)) {
    throw new Error('Invalid auto changeset policy value.')
  }
}

function template(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || value.length > 4096 || value.includes('\0')
    || /\{(?!title\}|number\}|packages\}|level\})[^}]*\}/u.test(value)) {
    throw new Error('Invalid auto changeset summary template or placeholder.')
  }
}

export function validatePolicy(input: unknown): AutoChangesetPolicy {
  const value = record(input, 'auto changeset policy')
  keys(value, ['schemaVersion', 'ignorePaths', 'paths', 'links', 'labels', 'titleTypes', 'defaultLevel', 'breakingRequiresLabel', 'summary'])
  optionalEnum(value['schemaVersion'], [1])
  optionalEnum(value['defaultLevel'], levels)
  optionalEnum(value['breakingRequiresLabel'], [true, false])
  if (value['ignorePaths'] !== undefined) {
    strings(value['ignorePaths'], 'ignorePaths')
  }
  for (const kind of ['labels', 'titleTypes']) {
    if (value[kind] !== undefined) {
      const map = record(value[kind], kind)
      for (const [key, level] of Object.entries(map)) {
        if (!key || ![...levels, ...(kind === 'labels' ? ['none'] : [])].includes(String(level))) {
          throw new Error(`Invalid auto changeset ${kind} mapping.`)
        }
      }
    }
  }
  for (const kind of ['paths', 'links']) {
    if (value[kind] === undefined) {
      continue
    }
    if (!Array.isArray(value[kind])) {
      throw new TypeError(`Invalid auto changeset ${kind}.`)
    }
    for (const entry of value[kind]) {
      const rule = record(entry, `${kind} rule`)
      keys(rule, kind === 'paths' ? ['patterns', 'packages', 'release', 'level'] : ['from', 'to', 'dependents', 'dependencyFields', 'level'])
      strings(rule[kind === 'paths' ? 'patterns' : 'from'], kind)
      if (rule[kind === 'paths' ? 'packages' : 'to'] !== undefined) {
        strings(rule[kind === 'paths' ? 'packages' : 'to'], kind)
      }
      optionalEnum(rule['level'], [...levels, ...(kind === 'links' ? ['same'] : [])])
      optionalEnum(rule[kind === 'paths' ? 'release' : 'dependents'], [true, false])
      if (kind === 'links' && !rule['to'] && rule['dependents'] !== true) {
        throw new Error('A link must select targets or dependency consumers.')
      }
      if (rule['dependencyFields'] !== undefined) {
        strings(rule['dependencyFields'], 'dependencyFields')
        if ((rule['dependencyFields'] as string[]).some(field => !['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies'].includes(field))) {
          throw new Error('Invalid link dependency field.')
        }
      }
    }
  }
  if (value['summary'] !== undefined) {
    const summary = record(value['summary'], 'summary policy')
    keys(summary, ['language', 'template', 'byType'])
    optionalEnum(summary['language'], ['en', 'zh-CN'])
    if (summary['template'] !== undefined) {
      template(summary['template'])
    }
    if (summary['byType'] !== undefined) {
      Object.values(record(summary['byType'], 'summary type templates')).forEach(template)
    }
  }
  return value as AutoChangesetPolicy
}
