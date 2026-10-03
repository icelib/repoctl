import type { EnvCacheEvidence } from '../../types/env-cache'
import { parse } from '@babel/parser'

const record = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
export const variableName = (name: unknown): name is string => typeof name === 'string' && /^[A-Z_]\w*$/iu.test(name)

function property(node: Record<string, unknown>): string | undefined {
  const value = record(node['property'])
  if (node['computed'] !== true && value?.['type'] === 'Identifier') {
    return String(value['name'])
  }
  return value?.['type'] === 'StringLiteral' ? String(value['value']) : undefined
}

function envObject(value: unknown): EnvCacheEvidence['kind'] | undefined {
  const node = record(value)
  if (!node || !['MemberExpression', 'OptionalMemberExpression'].includes(String(node['type'])) || property(node) !== 'env') {
    return
  }
  const object = record(node['object'])
  if (object?.['type'] === 'Identifier' && object['name'] === 'process') {
    return 'process-env'
  }
  if (object?.['type'] === 'MetaProperty' && record(object['meta'])?.['name'] === 'import' && record(object['property'])?.['name'] === 'meta') {
    return 'import-meta-env'
  }
}

export interface ScanResult {
  variables: Map<string, EnvCacheEvidence[]>
  dynamic: EnvCacheEvidence[]
  parseErrors: number[]
}

function add(result: ScanResult, name: unknown, evidence: EnvCacheEvidence) {
  if (variableName(name)) {
    const items = result.variables.get(name) ?? []
    if (!items.some(item => item.path === evidence.path && item.line === evidence.line && item.column === evidence.column)) {
      items.push(evidence)
    }
    result.variables.set(name, items)
  }
  else {
    result.dynamic.push({ ...evidence, kind: 'dynamic' })
  }
}

/** AST diagnostics never include expressions, string contents or parser error messages. */
export function scanSource(filename: string, source: string): ScanResult {
  const result: ScanResult = { variables: new Map(), dynamic: [], parseErrors: [] }
  const parts = filename.endsWith('.vue') || filename.endsWith('.svelte')
    ? [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].map(match => ({ text: match[1]!, offset: source.slice(0, match.index! + match[0].indexOf('>') + 1).split('\n').length - 1 }))
    : [{ text: source, offset: 0 }]
  for (const part of parts) {
    let ast: unknown
    try {
      ast = parse(part.text, { sourceType: 'unambiguous', plugins: /\.[cm]?ts$/.test(filename) ? ['typescript'] : ['typescript', 'jsx'], allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true })
    }
    catch {
      result.parseErrors.push(part.offset + 1)
      continue
    }
    function visit(value: unknown, parent?: Record<string, unknown>) {
      if (Array.isArray(value)) {
        value.forEach(item => visit(item, parent))
        return
      }
      const node = record(value)
      if (!node || typeof node['type'] !== 'string') {
        return
      }
      const start = record(record(node['loc'])?.['start'])
      const evidence = (kind: EnvCacheEvidence['kind']): EnvCacheEvidence => ({ path: filename, line: Number(start?.['line'] ?? 1) + part.offset, column: Number(start?.['column'] ?? 0) + 1, kind })
      const kind = envObject(node['object'])
      if (kind && ['MemberExpression', 'OptionalMemberExpression'].includes(node['type'])) {
        add(result, property(node), evidence(kind))
      }
      else if (node['type'] === 'VariableDeclarator' && envObject(node['init']) && record(node['id'])?.['type'] === 'ObjectPattern') {
        const properties = record(node['id'])!['properties'] as unknown[]
        for (const value of properties) {
          const item = record(value)
          const key = record(item?.['key'])
          const name = item?.['computed'] === true ? key?.['type'] === 'StringLiteral' ? key['value'] : undefined : key?.['name'] ?? key?.['value']
          add(result, name, evidence(envObject(node['init'])!))
        }
      }
      else if (envObject(node) && !(parent && (parent['object'] === node || (parent['type'] === 'VariableDeclarator' && record(parent['id'])?.['type'] === 'ObjectPattern')))) {
        result.dynamic.push(evidence('dynamic'))
      }
      for (const [key, child] of Object.entries(node)) {
        if (!['loc', 'comments', 'leadingComments', 'trailingComments', 'innerComments', 'tokens', 'errors'].includes(key)) {
          visit(child, node)
        }
      }
    }
    visit(ast)
  }
  return result
}

/** Only names from example files are retained; actual env files are never passed here. */
export function scanExample(filename: string, source: string): ScanResult {
  const result: ScanResult = { variables: new Map(), dynamic: [], parseErrors: [] }
  let quote: string | undefined
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    if (quote) {
      if (new RegExp(`(?<!\\\\)${quote}`).test(line)) {
        quote = undefined
      }
      continue
    }
    const match = /^\s*(?:export\s+)?([A-Z_]\w*)\s*=(.*)$/iu.exec(line)
    if (match) {
      add(result, match[1], { path: filename, line: index + 1, column: 1, kind: 'example' })
      const value = match[2]!.trimStart()
      if (/^["'`]/.test(value) && !new RegExp(`(?<!\\\\)${value[0]}`).test(value.slice(1))) {
        quote = value[0]
      }
    }
  }
  return result
}
