import type { ParsedTurboTask, TurboHashEvidence } from './types'
import { createHash } from 'node:crypto'

export function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function canonical(value: unknown, depth = 0): unknown {
  if (depth > 64) {
    throw new Error('Turbo summary evidence exceeds the supported nesting depth; input contents are omitted.')
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError('Turbo summary evidence contains a non-finite number; input contents are omitted.')
  }
  if (Array.isArray(value)) {
    return value.map(item => canonical(item, depth + 1))
  }
  const object = record(value)
  return object ? Object.fromEntries(Object.keys(object).sort().map(key => [key, canonical(object[key], depth + 1)])) : value
}

export function digest(value: unknown) {
  return createHash('sha256').update(JSON.stringify(canonical(value)) ?? 'undefined').digest('hex')
}

export function safeLabel(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 1024 && !/[\p{Cc}\p{Cf}]/u.test(value)
}

type Evidence = ParsedTurboTask['evidence']

export function addEvidence(output: Evidence, category: TurboHashEvidence['category'], field: string, value: unknown) {
  output.set(field, { category, digest: digest(value) })
}

export function inputEvidence(output: Evidence, prefix: string, value: unknown, category: 'input' | 'global-input') {
  const inputs = record(value)
  if (!inputs) {
    return false
  }
  let complete = true
  for (const [filename, hash] of Object.entries(inputs)) {
    if (typeof hash !== 'string' || !safeLabel(filename)) {
      complete = false
      continue
    }
    addEvidence(output, category, `${prefix}.${filename}`, hash)
  }
  return complete
}

/** Native summaries may contain NAME=hash or NAME=value. Neither suffix is emitted. */
export function environmentEvidence(output: Evidence, prefix: string, value: unknown) {
  const environment = record(value)
  const specified = record(environment?.['specified'])
  if (!environment || !specified) {
    return false
  }
  let complete = true
  for (const key of ['env', 'passThroughEnv']) {
    const values = specified[key]
    if ((key === 'passThroughEnv' && values === null) || (Array.isArray(values) && values.every(item => typeof item === 'string' && /^!?[A-Z_][\w*]*$/iu.test(item)))) {
      addEvidence(output, 'environment', `${prefix}.specified.${key}`, values === null ? [] : [...new Set(values)].sort())
    }
    else {
      complete = false
    }
  }
  for (const key of ['configured', 'inferred', 'passthrough']) {
    const values = environment[key]
    if (key === 'passthrough' && values === null) {
      continue
    }
    if (!Array.isArray(values)) {
      complete = false
      continue
    }
    const names = new Set<string>()
    for (const entry of values) {
      const separator = typeof entry === 'string' ? entry.indexOf('=') : -1
      const name = separator > 0 ? (entry as string).slice(0, separator) : ''
      if (!/^[A-Z_]\w*$/iu.test(name) || names.has(name)) {
        complete = false
        continue
      }
      names.add(name)
      addEvidence(output, 'environment', `${prefix}.${key}.${name}`, (entry as string).slice(separator + 1))
    }
  }
  return complete
}

export function configurationEvidence(output: Evidence, task: Record<string, unknown>) {
  const definition = record(task['resolvedTaskDefinition']) ?? {}
  // An explicit field allowlist prevents arbitrary config keys and raw secrets entering output.
  let complete = true
  for (const key of ['outputs', 'cache', 'dependsOn', 'inputs', 'outputLogs', 'persistent', 'interruptible', 'env', 'passThroughEnv', 'interactive']) {
    if (Object.hasOwn(definition, key)) {
      addEvidence(output, 'configuration', `definition.${key}`, definition[key])
    }
    else {
      complete = false
    }
  }
  for (const key of ['command', 'cliArguments', 'envMode', 'framework', 'outputs', 'excludedOutputs', 'hashOfExternalDependencies']) {
    if (Object.hasOwn(task, key)) {
      addEvidence(output, 'configuration', `task.${key}`, task[key])
    }
    else {
      complete = false
    }
  }
  return complete
}
