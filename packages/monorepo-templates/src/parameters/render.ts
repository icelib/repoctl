import type { TemplateSnapshot } from '../instances/types'
import type { ResolvedTemplateParameters, TemplateParameterManifest } from './types'
import { Buffer } from 'node:buffer'
import { maxSnapshotBytes, validateSnapshot } from '../instances/snapshot'
import { packageSections, templateParameterManifestName } from './manifest'
import { isParameterRecord, parameterError } from './schema'

export interface TemplateParameterRender {
  snapshot: TemplateSnapshot
  sensitivePaths: string[]
  files: Array<{ path: string, status: 'include' | 'omit', sensitive: boolean }>
  package: Array<{ section: string, name: string, status: 'include' | 'omit' }>
}

/** Expand declared text only. Binary files and all undeclared files remain byte-for-byte identical. */
export function renderTemplateParameters(source: TemplateSnapshot, manifest: TemplateParameterManifest, parameters: ResolvedTemplateParameters): TemplateParameterRender {
  validateSnapshot(source)
  const result: TemplateParameterRender = { snapshot: { schemaVersion: 1, files: [], directories: [] }, sensitivePaths: [], files: [], package: [] }
  const entries = new Set([...source.files.map(file => file.path), ...source.directories])
  const omitted = new Set<string>()
  const within = (file: string, directory: string) => file === directory || file.startsWith(`${directory}/`)
  for (const file of manifest.interpolate ?? []) {
    if (!source.files.some(entry => entry.path === file)) {
      parameterError('interpolate', `declared file does not exist: ${file}`)
    }
  }
  for (const condition of manifest.conditions ?? []) {
    for (const file of condition.files ?? []) {
      if (!entries.has(file)) {
        parameterError('conditions.files', `declared path does not exist: ${file}`)
      }
      if (parameters.values[condition.when.parameter] !== condition.when.equals) {
        omitted.add(file)
      }
    }
  }
  let outputBytes = source.files.filter(file => file.path !== templateParameterManifestName && ![...omitted].some(item => within(file.path, item))).reduce((total, file) => total + Buffer.byteLength(file.content, 'base64'), 0)
  function checkSize() {
    if (outputBytes > maxSnapshotBytes) {
      parameterError('output', 'rendered snapshot exceeds 32 MiB')
    }
  }
  function interpolate(text: string, file: string, allowSensitive: boolean) {
    if (!allowSensitive) {
      outputBytes += Buffer.byteLength(text)
      checkSize()
    }
    return text.replace(/\{\{repoctl(-json)?:([a-z]\w*)\}\}/gu, (token, json: string | undefined, name: string) => {
      if (!Object.hasOwn(parameters.values, name)) {
        parameterError(`values.${name}`, 'an interpolated parameter is missing')
      }
      if (parameters.sensitive.includes(name)) {
        if (!allowSensitive) {
          parameterError(`values.${name}`, 'sensitive inputs cannot enter package metadata')
        }
        result.sensitivePaths.push(file)
      }
      const replacement = json ? JSON.stringify(parameters.values[name]) : String(parameters.values[name])
      outputBytes += Buffer.byteLength(replacement) - Buffer.byteLength(token)
      checkSize()
      return replacement
    })
  }
  for (const file of source.files) {
    if (file.path === templateParameterManifestName) {
      continue
    }
    if ([...omitted].some(item => within(file.path, item))) {
      result.files.push({ path: file.path, status: 'omit', sensitive: false })
      continue
    }
    let content = Buffer.from(file.content, 'base64')
    if (manifest.interpolate?.includes(file.path) && !content.includes(0)) {
      let text: string | undefined
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(content)
      }
      catch { /* Binary assets are copied unchanged. */ }
      if (text !== undefined) {
        content = Buffer.from(interpolate(text, file.path, true))
      }
    }
    result.snapshot.files.push({ ...file, content: content.toString('base64') })
    result.files.push({ path: file.path, status: 'include', sensitive: result.sensitivePaths.includes(file.path) })
  }
  result.snapshot.directories = source.directories.filter(directory => ![...omitted].some(item => within(directory, item)))
  const packageFile = result.snapshot.files.find(file => file.path === 'package.json')
  if (manifest.conditions?.some(condition => condition.package)) {
    if (!packageFile) {
      parameterError('conditions.package', 'a package.json file is required')
    }
    let pkg: Record<string, unknown>
    try {
      const value: unknown = JSON.parse(Buffer.from(packageFile.content, 'base64').toString('utf8'))
      if (!isParameterRecord(value)) {
        throw new Error('invalid')
      }
      pkg = value
    }
    catch { parameterError('conditions.package', 'package.json must be a JSON object') }
    const reserved = new Set<string>()
    for (const condition of manifest.conditions ?? []) {
      for (const section of packageSections) {
        for (const [name, template] of Object.entries(condition.package?.[section] ?? {})) {
          const identity = `${section}.${name}`
          if (reserved.has(identity) || (isParameterRecord(pkg[section]) && Object.hasOwn(pkg[section], name))) {
            parameterError(`conditions.package.${identity}`, 'conditional entries must have one owner and be absent from the base manifest')
          }
          reserved.add(identity)
          const include = parameters.values[condition.when.parameter] === condition.when.equals
          result.package.push({ section, name, status: include ? 'include' : 'omit' })
          if (include) {
            if (pkg[section] !== undefined && !isParameterRecord(pkg[section])) {
              parameterError(`conditions.package.${section}`, 'base manifest section must be an object')
            }
            const values = pkg[section] as Record<string, unknown> | undefined ?? {}
            values[name] = interpolate(template, 'package.json', false)
            pkg[section] = Object.fromEntries(Object.entries(values).sort(([a], [b]) => a.localeCompare(b)))
          }
        }
      }
    }
    packageFile.content = Buffer.from(`${JSON.stringify(pkg, null, 2)}\n`).toString('base64')
  }
  result.sensitivePaths = [...new Set(result.sensitivePaths)].sort()
  validateSnapshot(result.snapshot)
  return result
}
