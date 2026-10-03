import type { ParsedTurboSummary, ParsedTurboTask, TurboAnalysisLimitation } from './types'
import { Buffer } from 'node:buffer'
import { readFile, stat } from 'node:fs/promises'
import { addEvidence, configurationEvidence, digest, environmentEvidence, inputEvidence, record, safeLabel } from './evidence'

const finite = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null

function parseTask(task: Record<string, unknown>, id: string): ParsedTurboTask {
  const execution = record(task['execution'])
  const start = finite(execution?.['startTime'])
  const end = finite(execution?.['endTime'])
  const cache = record(task['cache'])
  const dependencies = task['dependencies']
  const evidence: ParsedTurboTask['evidence'] = new Map()
  const completeGroups = new Set<string>()
  if (inputEvidence(evidence, 'inputs', task['inputs'], 'input')) {
    completeGroups.add('inputs')
  }
  if (environmentEvidence(evidence, 'environment', task['environmentVariables'])) {
    completeGroups.add('environment')
  }
  if (configurationEvidence(evidence, task)) {
    completeGroups.add('configuration')
  }
  return {
    id,
    cache: cache?.['status'] === 'HIT' ? 'hit' : cache?.['status'] === 'MISS' ? 'miss' : 'unknown',
    start,
    end,
    duration: start !== null && end !== null && end >= start ? end - start : null,
    exitCode: typeof execution?.['exitCode'] === 'number' && Number.isInteger(execution['exitCode']) ? execution['exitCode'] : null,
    hash: typeof task['hash'] === 'string' && task['hash'] ? digest(task['hash']) : null,
    dependencies: Array.isArray(dependencies) && dependencies.every(safeLabel)
      ? [...new Set(dependencies)].sort()
      : null,
    evidence,
    completeGroups,
  }
}

function globalEvidence(value: unknown, result: ParsedTurboSummary) {
  const global = record(value)
  if (!global) {
    return
  }
  if (inputEvidence(result.globalEvidence, 'global.files', global['files'], 'global-input')) {
    result.completeGroups.add('global.files')
  }
  if (environmentEvidence(result.globalEvidence, 'global.environment', global['environmentVariables'])) {
    result.completeGroups.add('global.environment')
  }
  let complete = true
  for (const key of ['rootKey', 'hashOfExternalDependencies', 'hashOfInternalDependencies', 'engines']) {
    if (Object.hasOwn(global, key)) {
      addEvidence(result.globalEvidence, 'global-input', `global.${key}`, global[key])
    }
    else {
      complete = false
    }
  }
  if (complete) {
    result.completeGroups.add('global.configuration')
  }
}

export async function readTurboSummary(filename: string, summary: 'current' | 'previous'): Promise<ParsedTurboSummary> {
  let root: Record<string, unknown> | null
  try {
    const metadata = await stat(filename)
    if (!metadata.isFile() || metadata.size > 20 * 1024 * 1024) {
      throw new Error('Unsupported file size or type')
    }
    const contents = await readFile(filename, 'utf8')
    if (Buffer.byteLength(contents) > 20 * 1024 * 1024) {
      throw new Error('Summary changed size')
    }
    root = record(JSON.parse(contents))
  }
  catch {
    throw new Error(`Cannot read ${summary} Turbo summary as a JSON object of at most 20 MiB; input contents are omitted.`)
  }
  if (!root) {
    throw new Error(`The ${summary} Turbo summary must be a JSON object.`)
  }
  const limitations: TurboAnalysisLimitation[] = []
  const result: ParsedTurboSummary = {
    supported: root['version'] === '1' || root['version'] === 1,
    turboVersion: typeof root['turboVersion'] === 'string' && /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/u.test(root['turboVersion']) ? root['turboVersion'] : null,
    tasks: new Map(),
    ambiguous: false,
    globalEvidence: new Map(),
    completeGroups: new Set(),
    limitations,
  }
  if (!result.supported) {
    limitations.push({ code: 'unsupported_schema', summary })
  }
  if (!Array.isArray(root['tasks'])) {
    limitations.push({ code: 'missing_tasks', summary })
    result.ambiguous = true
    return result
  }
  const duplicates = new Set<string>()
  for (const value of root['tasks']) {
    const task = record(value)
    const id = task?.['taskId']
    if (!task || !safeLabel(id)) {
      limitations.push({ code: 'missing_task_identity', summary })
      result.ambiguous = true
      continue
    }
    if (result.tasks.has(id) || duplicates.has(id)) {
      result.tasks.delete(id)
      duplicates.add(id)
      result.ambiguous = true
      continue
    }
    const parsed = parseTask(task, id)
    if (parsed.duration === null) {
      limitations.push({ code: 'missing_task_timing', summary, taskId: id })
    }
    result.tasks.set(id, parsed)
  }
  for (const id of [...duplicates].sort()) {
    limitations.push({ code: 'duplicate_task_identity', summary, taskId: id })
  }
  globalEvidence(root['globalCacheInputs'], result)
  for (const task of result.tasks.values()) {
    if (task.dependencies === null) {
      limitations.push({ code: 'missing_task_dependencies', summary, taskId: task.id })
      continue
    }
    addEvidence(task.evidence, 'dependency', 'dependencies.members', task.dependencies)
    let complete = true
    for (const dependency of task.dependencies) {
      const hash = result.tasks.get(dependency)?.hash
      if (hash === null || hash === undefined) {
        complete = false
      }
      else {
        addEvidence(task.evidence, 'dependency', `dependencies.hash.${dependency}`, hash)
      }
    }
    if (complete) {
      task.completeGroups.add('dependencies')
    }
    else {
      limitations.push({ code: 'missing_dependency_hash', summary, taskId: task.id })
    }
  }
  for (const field of ['global.files', 'global.environment', 'global.configuration']) {
    if (!result.completeGroups.has(field)) {
      limitations.push({ code: 'incomplete_hash_evidence', summary, field })
    }
  }
  for (const task of result.tasks.values()) {
    for (const field of ['inputs', 'environment', 'configuration', 'dependencies']) {
      if (!task.completeGroups.has(field)) {
        limitations.push({ code: 'incomplete_hash_evidence', summary, taskId: task.id, field })
      }
    }
  }
  return result
}
