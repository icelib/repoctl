import type { PublicApiEntryConfig } from './types'
import { readFile } from 'node:fs/promises'
import path from 'pathe'
import { record, safeFile } from '../deps/files'
import { readOptional, relativeFile } from '../upgrade/plan/files'

export function reportPath(value: string) {
  relativeFile(value)
  if ([...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 || char === ':') || value.split('/').some(part => ['node_modules', '.repoctl', '.turbo', '.git', '.changeset'].includes(part))) {
    throw new Error(`Unsupported API report path: ${value}`)
  }
  return value
}

function targets(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value]
  }
  const conditions = record(value)
  if (!conditions || Object.keys(conditions).some(condition => condition.startsWith('types@'))) {
    return []
  }
  if (Object.hasOwn(conditions, 'types')) {
    return targets(conditions['types'])
  }
  return Object.values(conditions).flatMap(targets)
}

export async function entryPaths(root: string, workspace: string, subpath: string, config: PublicApiEntryConfig, tsconfig = 'tsconfig.json') {
  const source = reportPath(config.entryPoint)
  const baseline = reportPath(config.baseline)
  if (!/\.d\.(?:ts|mts|cts)$/u.test(source) || !baseline.endsWith('.api.md')) {
    throw new Error('API entryPoint must be a built .d.ts/.d.mts/.d.cts file; baseline must end with .api.md.')
  }
  const relative = (filename: string) => workspace === '.' ? filename : `${workspace}/${filename}`
  const packageJson = await safeFile(root, relative('package.json'))
  const manifest = JSON.parse(await readFile(packageJson, 'utf8')) as Record<string, unknown>
  const exports = record(manifest['exports'])
  const exported = exports && Object.keys(exports).some(key => key.startsWith('.')) ? exports[subpath] : subpath === '.' ? manifest['exports'] : undefined
  const declarations = targets(exported).map(item => item.replace(/^\.\//u, '').replace(/(?<!\.d)\.(cjs|mjs|js)$/u, (_, ext: string) => ext === 'js' ? '.d.ts' : ext === 'mjs' ? '.d.mts' : '.d.cts'))
  const types = manifest['types'] ?? manifest['typings']
  if (manifest['exports'] === undefined && subpath === '.' && typeof types === 'string') {
    declarations.push(types.replace(/^\.\//u, ''))
  }
  if ((manifest['exports'] !== undefined && (exported === undefined || exported === null)) || !declarations.includes(source)) {
    throw new Error(`Configured API entry is not a literal public declaration target: ${workspace}:${subpath}`)
  }
  const original = await readOptional(root, baseline)
  const before = original?.toString('utf8') ?? null
  if (before !== null && !before.startsWith('## API Report File for ')) {
    throw new Error(`Refusing to replace a non-API-Extractor baseline: ${baseline}`)
  }
  return {
    entryPoint: await safeFile(root, relative(source)),
    tsconfig: await safeFile(root, relative(reportPath(tsconfig))),
    packageJson,
    baseline,
    before,
    entryRelative: path.relative(root, path.join(root, relative(source))),
  }
}
