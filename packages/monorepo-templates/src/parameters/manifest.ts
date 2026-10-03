import type { TemplateSnapshot } from '../instances/types'
import type { TemplateParameterManifest } from './types'
import { Buffer } from 'node:buffer'
import { portableRelativePath } from '../instances/paths'
import { isParameterRecord, parameterError, parameterValueMatches, validateTemplateParameterSchema } from './schema'

export const templateParameterManifestName = 'repoctl.template.json'
export const packageSections = ['scripts', 'dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const

function paths(input: unknown, field: string) {
  if (!Array.isArray(input) || input.length > 1000 || input.some(item => typeof item !== 'string') || new Set(input).size !== input.length) {
    parameterError(field, 'expected unique relative paths')
  }
  for (const item of input) {
    portableRelativePath(item)
    if (/[*?{}[\]]/u.test(item) || item === templateParameterManifestName || item === 'package.json') {
      parameterError(field, 'use exact asset paths; package entries belong in conditions.package')
    }
  }
}

export function parseTemplateParameterManifest(value: unknown): TemplateParameterManifest {
  if (!isParameterRecord(value) || value['schemaVersion'] !== 1
    || Object.keys(value).some(key => !['schemaVersion', 'parameters', 'interpolate', 'conditions'].includes(key))) {
    parameterError('manifest', 'expected schemaVersion 1 and supported declarative fields')
  }
  validateTemplateParameterSchema(value['parameters'])
  if (value['interpolate'] !== undefined) {
    paths(value['interpolate'], 'interpolate')
  }
  if (value['conditions'] !== undefined) {
    if (!Array.isArray(value['conditions']) || value['conditions'].length > 100) {
      parameterError('conditions', 'expected at most 100 conditions')
    }
    for (const [index, item] of value['conditions'].entries()) {
      const field = `conditions[${index}]`
      if (!isParameterRecord(item) || Object.keys(item).some(key => !['when', 'files', 'package'].includes(key)) || !isParameterRecord(item['when'])
        || Object.keys(item['when']).some(key => !['parameter', 'equals'].includes(key)) || typeof item['when']['parameter'] !== 'string') {
        parameterError(field, 'expected a parameter equality condition')
      }
      const definition = Object.hasOwn(value['parameters'], item['when']['parameter']) ? value['parameters'][item['when']['parameter']] : undefined
      if (!definition || definition.sensitive || !parameterValueMatches(definition, item['when']['equals'])) {
        parameterError(`${field}.when`, 'condition must compare a declared nonsensitive parameter with a value of its type')
      }
      if (item['files'] !== undefined) {
        paths(item['files'], `${field}.files`)
      }
      if (item['package'] !== undefined) {
        if (!isParameterRecord(item['package']) || Object.keys(item['package']).some(key => !packageSections.includes(key as typeof packageSections[number]))) {
          parameterError(`${field}.package`, 'only scripts and dependency maps are supported')
        }
        for (const [section, entries] of Object.entries(item['package'])) {
          if (!isParameterRecord(entries) || Object.entries(entries).some(([key, value]) => !key || ['__proto__', 'constructor', 'prototype'].includes(key) || typeof value !== 'string')) {
            parameterError(`${field}.package.${section}`, 'expected a map of string entries')
          }
        }
      }
      if (item['files'] === undefined && item['package'] === undefined) {
        parameterError(field, 'declare files or package entries')
      }
    }
  }
  return value as unknown as TemplateParameterManifest
}

export function readTemplateParameterManifest(snapshot: TemplateSnapshot) {
  const file = snapshot.files.find(file => file.path === templateParameterManifestName)
  if (!file) {
    return undefined
  }
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(file.content, 'base64')))
  }
  catch {
    parameterError('manifest', 'repoctl.template.json must contain UTF-8 JSON')
  }
  return parseTemplateParameterManifest(value)
}
