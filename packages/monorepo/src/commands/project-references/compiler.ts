import type * as TypeScript from 'typescript'
import type { ProjectReferencesDiagnostic } from '../../types'
import { createRequire } from 'node:module'
import path from 'pathe'
import { hash } from '../deps/files'
import { exists, readText, referenceTarget } from './files'

export interface ProjectConfig {
  path: string
  original: string
  references: Array<{ path: string }>
  options: TypeScript.CompilerOptions
}

export function loadCompiler(root: string): typeof TypeScript {
  try {
    return createRequire(path.join(root, 'package.json'))('typescript')
  }
  catch {
    throw new Error('Install TypeScript in the workspace before checking or synchronizing project references.')
  }
}

export function configReader(root: string, ts: typeof TypeScript, inputs: Record<string, string>, diagnostics: ProjectReferencesDiagnostic[]) {
  const cache = new Map<string, ProjectConfig | undefined>()
  return async (file: string) => {
    if (cache.has(file)) {
      return cache.get(file)
    }
    cache.set(file, undefined)
    if (!await exists(root, file)) {
      diagnostics.push({ code: 'missing', path: file, message: `Project configuration does not exist: ${file}` })
      inputs[file] = 'missing'
      return undefined
    }
    const original = await readText(root, file, inputs)
    const parsed = ts.parseConfigFileTextToJson(file, original)
    if (parsed.error) {
      diagnostics.push({ code: 'config', path: file, message: ts.flattenDiagnosticMessageText(parsed.error.messageText, '\n') })
      return undefined
    }
    const config = parsed.config
    if (!config || typeof config !== 'object' || Array.isArray(config) || (config.references !== undefined && (!Array.isArray(config.references) || config.references.some((ref: unknown) => !ref || typeof ref !== 'object' || typeof (ref as { path?: unknown }).path !== 'string')))) {
      diagnostics.push({ code: 'config', path: file, message: 'Expected a tsconfig object and references containing string paths.' })
      return undefined
    }
    const source = ts.parseJsonText(file, original)
    const object = (source.statements[0] as TypeScript.ExpressionStatement).expression as TypeScript.ObjectLiteralExpression
    if (object.properties.filter(property => property.name && ts.isStringLiteral(property.name) && property.name.text === 'references').length > 1) {
      diagnostics.push({ code: 'config', path: file, message: 'Duplicate references properties are ambiguous.' })
      return undefined
    }
    const command = ts.getParsedCommandLineOfConfigFile(path.join(root, file), {}, {
      ...ts.sys,
      readFile(filename) {
        const value = ts.sys.readFile(filename)
        inputs[`compiler:${path.normalize(filename)}`] = value === undefined ? 'missing' : hash(value)
        return value
      },
      onUnRecoverableConfigFileDiagnostic(error) {
        diagnostics.push({ code: 'config', path: file, message: ts.flattenDiagnosticMessageText(error.messageText, '\n') })
      },
    })
    for (const error of command?.errors ?? []) {
      // Vue SFC inputs are expanded by vue-tsc; neither an empty solution nor a Vue config is a TS parse failure.
      if (error.code !== 18003 && error.code !== 18002) {
        diagnostics.push({ code: 'config', path: file, message: ts.flattenDiagnosticMessageText(error.messageText, '\n') })
      }
    }
    const result: ProjectConfig = { path: file, original, references: config.references ?? [], options: command?.options ?? {} }
    cache.set(file, result)
    return result
  }
}

export async function validateGraph(
  starts: string[],
  projected: Map<string, Array<{ path: string }>>,
  read: ReturnType<typeof configReader>,
  diagnostics: ProjectReferencesDiagnostic[],
) {
  const visited = new Set<string>()
  const visiting: string[] = []
  const validated = new Set<string>()
  const visit = async (file: string) => {
    if (visiting.includes(file)) {
      diagnostics.push({ code: 'cycle', path: file, message: `Project reference cycle: ${[...visiting.slice(visiting.indexOf(file)), file].join(' -> ')}` })
      return
    }
    if (visited.has(file)) {
      return
    }
    const config = await read(file)
    if (!config) {
      return
    }
    visiting.push(file)
    for (const reference of projected.get(file) ?? config.references) {
      let target: string
      try {
        target = referenceTarget(file, reference.path)
      }
      catch (error) {
        diagnostics.push({ code: 'config', path: file, message: (error as Error).message })
        continue
      }
      const dependency = await read(target)
      if (dependency && !validated.has(target)) {
        validated.add(target)
        if (dependency.options.composite !== true || dependency.options.declaration === false || dependency.options.noEmit === true) {
          diagnostics.push({ code: 'incompatible', path: target, message: 'Referenced projects require composite and declaration output; repoctl does not change compiler options.' })
        }
      }
      await visit(target)
    }
    visiting.pop()
    visited.add(file)
  }
  for (const file of starts) {
    await visit(file)
  }
}
