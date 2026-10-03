import type { Declaration } from './patterns'
import { lstat, readFile } from 'node:fs/promises'
import { parse } from 'comment-json'
import path from 'pathe'

const arrays = ['env', 'passThroughEnv', 'inputs'] as const
type ArrayKey = typeof arrays[number]
interface Definition {
  enabled?: boolean
  env?: Declaration[]
  passThroughEnv?: Declaration[]
  inputs?: Declaration[]
  cache?: boolean
  extends?: boolean
}

interface Configuration {
  filename: string
  extends: string[]
  tasks: Map<string, Definition>
  globalEnv: Declaration[]
  globalPassThroughEnv: Declaration[]
  globalDependencies: Declaration[]
}

export interface TaskConfiguration {
  enabled: boolean
  env: Declaration[]
  passThroughEnv: Declaration[]
  inputs: Declaration[] | undefined
  cache: boolean
  globalEnv: Declaration[]
  globalPassThroughEnv: Declaration[]
  globalDependencies: Declaration[]
}

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string' && item.length > 0 && item.length <= 1024 && !/[\p{Cc}\p{Cf}]/u.test(item))
}

async function readConfiguration(root: string, directory: string): Promise<Configuration | null> {
  const candidates: string[] = []
  for (const name of ['turbo.json', 'turbo.jsonc']) {
    try {
      const metadata = await lstat(path.join(directory, name))
      if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 || metadata.size > 1024 * 1024) {
        throw new Error('Unsafe or oversized Turbo configuration')
      }
      candidates.push(name)
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  }
  if (!candidates.length) {
    return null
  }
  if (candidates.length > 1) {
    throw new Error('Both turbo.json and turbo.jsonc exist')
  }
  const filename = path.relative(root, path.join(directory, candidates[0]!))
  let value: unknown
  try {
    value = parse(await readFile(path.join(root, filename), 'utf8'))
  }
  catch {
    throw new Error('Cannot parse Turbo configuration; contents omitted')
  }
  if (!object(value) || value['global'] !== undefined || (object(value['futureFlags']) && value['futureFlags']['globalConfiguration'] === true) || value['pipeline'] !== undefined || (value['tasks'] !== undefined && !object(value['tasks']))) {
    throw new Error('Invalid Turbo configuration shape')
  }
  if (directory !== root && ['globalEnv', 'globalPassThroughEnv', 'globalDependencies'].some(field => Object.hasOwn(value, field))) {
    throw new Error('Global Turbo declarations belong in the root configuration')
  }
  const readArray = (data: Record<string, unknown>, field: string, context: string): Declaration[] => {
    const items = data[field] ?? []
    if (!strings(items) || (field.toLowerCase().includes('env') && items.some(item => item !== '$TURBO_EXTENDS$' && !/^[\w!*\\]+$/.test(item)))) {
      throw new Error('Invalid Turbo array declaration; contents omitted')
    }
    if (items.includes('$TURBO_EXTENDS$') && (items[0] !== '$TURBO_EXTENDS$' || directory === root)) {
      throw new Error('Invalid Turbo inheritance marker')
    }
    return items.map(pattern => ({ pattern, path: filename, field: `${context}${field}` }))
  }
  const tasks = new Map<string, Definition>()
  for (const [name, task] of Object.entries(value['tasks'] ?? {})) {
    if (!object(task) || (task['cache'] !== undefined && typeof task['cache'] !== 'boolean') || (task['extends'] !== undefined && (directory === root || typeof task['extends'] !== 'boolean'))) {
      throw new Error('Invalid Turbo task declaration')
    }
    const definition: Definition = {}
    for (const field of arrays) {
      if (Object.hasOwn(task, field)) {
        definition[field] = readArray(task, field, `tasks.${name}.`)
      }
    }
    if (task['cache'] !== undefined) {
      definition.cache = task['cache'] as boolean
    }
    if (task['extends'] !== undefined) {
      definition.extends = task['extends'] as boolean
    }
    tasks.set(name, definition)
  }
  const inherited = value['extends'] ?? []
  if (!strings(inherited) || (directory !== root && inherited[0] !== '//')) {
    throw new Error('Package Turbo configuration must extend // first')
  }
  return { filename, extends: inherited, tasks, globalEnv: readArray(value, 'globalEnv', ''), globalPassThroughEnv: readArray(value, 'globalPassThroughEnv', ''), globalDependencies: readArray(value, 'globalDependencies', '') }
}

function merge(base: Definition, next: Definition): Definition {
  const result: Definition = next.extends === false ? { enabled: Object.keys(next).some(key => key !== 'extends') } : { ...base }
  for (const key of arrays) {
    const items = next[key]
    if (items !== undefined) {
      result[key] = items[0]?.pattern === '$TURBO_EXTENDS$' ? [...(result[key] ?? []), ...items.slice(1)] : items
    }
  }
  if (next.cache !== undefined) {
    result.cache = next.cache
  }
  return result
}

export async function loadTurboConfigurations(root: string, packages: Array<{ name: string, directory: string }>) {
  const rootConfig = await readConfiguration(root, root)
  if (!rootConfig) {
    throw new Error('Root Turbo configuration is missing')
  }
  const configurations = new Map<string, Configuration | null>()
  for (const pkg of packages) {
    if (pkg.directory !== root) {
      if (configurations.has(pkg.name)) {
        throw new Error('Duplicate workspace package names prevent configuration resolution')
      }
      configurations.set(pkg.name, await readConfiguration(root, pkg.directory))
    }
  }
  function layers(name: string, task: string, visiting: string[] = []): Definition[] {
    if (visiting.includes(name)) {
      throw new Error('Turbo package configuration inheritance cycle')
    }
    const config = configurations.get(name)
    const result: Definition[] = []
    if (config) {
      for (const parent of config.extends.filter(item => item !== '//')) {
        if (!configurations.has(parent) || !configurations.get(parent)) {
          throw new Error('Unknown inherited Turbo package configuration')
        }
        result.push(...layers(parent, task, [...visiting, name]))
      }
      if (config.tasks.has(task)) {
        result.push(config.tasks.get(task)!)
      }
    }
    return result
  }
  return (name: string, task: string): TaskConfiguration => {
    // A package-qualified root definition replaces its generic root definition.
    const base = rootConfig.tasks.get(`${name}#${task}`) ?? (name === '//' ? undefined : rootConfig.tasks.get(task))
    const inherited = layers(name, task)
    const current = inherited.reduce(merge, base ?? {})
    return { enabled: current.enabled ?? (base !== undefined || inherited.length > 0), env: current.env ?? [], passThroughEnv: current.passThroughEnv ?? [], inputs: current.inputs, cache: current.cache ?? true, globalEnv: rootConfig.globalEnv, globalPassThroughEnv: rootConfig.globalPassThroughEnv, globalDependencies: rootConfig.globalDependencies }
  }
}

export type { ArrayKey }
