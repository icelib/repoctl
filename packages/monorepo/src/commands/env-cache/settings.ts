import type { EnvCacheConfig, EnvCacheFinding, EnvCacheOptions, EnvCacheSuppression } from '../../types/env-cache'
import { matchesFile } from './patterns'

const list = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string' && item.length > 0 && item.length <= 1024 && !/[\p{Cc}\p{Cf}]/u.test(item))
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)

export function settings(value: unknown, options: EnvCacheOptions): EnvCacheConfig & { tasks: string[], frameworkInference: boolean } {
  if (value !== undefined && !object(value)) {
    throw new Error('commands.env must be an object')
  }
  const config = (value ?? {}) as Record<string, unknown>
  for (const key of ['tasks', 'include', 'exclude']) {
    if (config[key] !== undefined && !list(config[key])) {
      throw new Error('Invalid environment scan list; contents omitted')
    }
  }
  if (config['frameworkInference'] !== undefined && typeof config['frameworkInference'] !== 'boolean') {
    throw new Error('frameworkInference must be boolean')
  }
  if (options.frameworkInference !== undefined && typeof options.frameworkInference !== 'boolean') {
    throw new Error('frameworkInference must be boolean')
  }
  const tasks = options.tasks ?? config['tasks'] ?? ['build']
  if (!list(tasks) || !tasks.length || tasks.some(task => !/^[\w:.-]+$/.test(task))) {
    throw new Error('Environment tasks must be nonempty task names')
  }
  if (config['suppressions'] !== undefined && (!Array.isArray(config['suppressions']) || config['suppressions'].some((item) => {
    return !object(item) || typeof item['rule'] !== 'string' || !/^[a-z-]+$/.test(item['rule']) || typeof item['reason'] !== 'string' || !item['reason'].trim()
      || ['package', 'task', 'variable', 'path'].some(key => item[key] !== undefined && !list([item[key]]))
  }))) {
    throw new Error('Every environment suppression needs a rule, a reason and valid optional selectors')
  }
  return { ...config as EnvCacheConfig, tasks: [...new Set(tasks)], frameworkInference: options.frameworkInference ?? config['frameworkInference'] as boolean | undefined ?? true }
}

export function suppress(findings: EnvCacheFinding[], suppressions: EnvCacheSuppression[] = []) {
  const used = new Set<number>()
  for (const finding of findings) {
    const index = suppressions.findIndex(item => item.rule === finding.rule && ['package', 'task', 'variable', 'path'].every((field) => {
      const key = field as 'package' | 'task' | 'variable' | 'path'
      return item[key] === undefined || (finding[key] !== null && matchesFile(finding[key]!, [item[key]!]))
    }))
    if (index >= 0) {
      used.add(index)
      finding.suppression = { index, reason: suppressions[index]!.reason }
    }
  }
  for (const [index] of suppressions.entries()) {
    if (!used.has(index)) {
      findings.push({ rule: 'env-suppression-unused', severity: 'warn', package: '//', task: null, variable: null, path: null, line: null, message: `Environment suppression ${index} did not match any finding.` })
    }
  }
}
