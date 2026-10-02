import type * as TypeScript from 'typescript'
import type { ProjectReferencesDiagnostic } from '../../types'
import type { ProjectConfig } from './compiler'
import { parse, stringify } from 'comment-json'
import { record } from '../deps/files'
import { compare, exists, ownershipFile, readText, referencePath, referenceTarget, relativeFile } from './files'

export interface Ownership {
  schemaVersion: 1
  configs: Record<string, string[]>
}

export async function readOwnership(root: string, inputs: Record<string, string>) {
  if (!await exists(root, ownershipFile)) {
    inputs[ownershipFile] = 'missing'
    return { original: null, state: { schemaVersion: 1, configs: {} } as Ownership }
  }
  const original = await readText(root, ownershipFile, inputs)
  const state = JSON.parse(original.replace(/^\uFEFF/, ''))
  if (record(state) && Object.hasOwn(state, 'transaction')) {
    throw new Error('Pending TypeScript references transaction. Verify no writer is active, preserve backups and reconcile the registry before retrying.')
  }
  if (!record(state) || state.schemaVersion !== 1 || Object.keys(state).some(key => !['schemaVersion', 'configs'].includes(key)) || !record(state.configs)) {
    throw new Error('Invalid TypeScript reference ownership registry.')
  }
  for (const [file, references] of Object.entries(state.configs)) {
    relativeFile(file)
    if (!Array.isArray(references) || references.length !== new Set(references).size || references.some(ref => typeof ref !== 'string' || referencePath(file, referenceTarget(file, ref)) !== ref)) {
      throw new Error(`Invalid managed project references: ${file}`)
    }
  }
  return { original, state: state as Ownership }
}

export function reconcile(config: ProjectConfig, owned: string[], desired: string[], diagnostics: ProjectReferencesDiagnostic[]) {
  const document = parse(config.original.replace(/^\uFEFF/, '')) as { references?: Array<{ path: string }> }
  const references = document.references ?? []
  const managed: string[] = []
  for (const ref of owned) {
    const matching = references.filter(item => item.path === ref)
    if (matching.length !== 1 || Object.keys(matching[0]!).length !== 1) {
      diagnostics.push({ code: 'ownership', path: config.path, message: `Managed reference was edited or removed: ${ref}. Restore it or explicitly remove its ownership registry entry.` })
    }
  }
  const targets = new Set(desired)
  for (let index = references.length - 1; index >= 0; index--) {
    const ref = references[index]!
    if (owned.includes(ref.path) && !targets.has(referenceTarget(config.path, ref.path))) {
      references.splice(index, 1)
    }
  }
  for (const target of [...targets].sort(compare)) {
    const matching = references.find(ref => referenceTarget(config.path, ref.path) === target)
    if (!matching) {
      const ref = referencePath(config.path, target)
      references.push({ path: ref })
      managed.push(ref)
    }
    else if (owned.includes(matching.path)) {
      managed.push(matching.path)
    }
  }
  return { references, managed: managed.sort(compare) }
}

/** Replace only the references value; preserve all unrelated JSONC bytes and BOM/newlines. */
export function renderReferences(ts: typeof TypeScript, config: ProjectConfig, references: Array<{ path: string }>) {
  if (JSON.stringify(config.references) === JSON.stringify(references)) {
    return config.original
  }
  const source = ts.parseJsonText(config.path, config.original)
  const object = (source.statements[0] as TypeScript.ExpressionStatement).expression as TypeScript.ObjectLiteralExpression
  const properties = object.properties.filter(property => property.name && ts.isStringLiteral(property.name) && property.name.text === 'references')
  if (properties.length > 1) {
    throw new Error(`Duplicate references property: ${config.path}`)
  }
  const indentation = config.original.match(/\n([\t ]+)"/)?.[1] ?? '  '
  const newline = config.original.includes('\r\n') ? '\r\n' : '\n'
  const serialized = stringify(references, null, indentation).replaceAll('\n', `${newline}${indentation}`)
  if (properties.length) {
    const value = (properties[0] as TypeScript.PropertyAssignment).initializer
    return config.original.slice(0, value.getStart(source)) + serialized + config.original.slice(value.end)
  }
  const last = object.properties.at(-1)
  const insertion = `${newline}${indentation}"references": ${serialized}${newline}`
  const end = object.end - 1
  const prefix = last && !object.properties.hasTrailingComma
    ? `${config.original.slice(0, last.end)},${config.original.slice(last.end, end)}`
    : config.original.slice(0, end)
  return prefix + insertion + config.original.slice(end)
}
