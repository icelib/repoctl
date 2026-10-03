import type { ParsedTurboSummary, ParsedTurboTask, TurboHashEvidence, TurboTaskAnalysis } from './types'

function group(field: string) {
  if (field.startsWith('global.files.')) {
    return 'global.files'
  }
  if (field.startsWith('global.environment.')) {
    return 'global.environment'
  }
  if (field.startsWith('global.')) {
    return 'global.configuration'
  }
  if (field.startsWith('inputs.')) {
    return 'inputs'
  }
  if (field.startsWith('environment.')) {
    return 'environment'
  }
  if (field.startsWith('dependencies.')) {
    return 'dependencies'
  }
  return 'configuration'
}

export function compareEvidence(currentEvidence: ParsedTurboTask['evidence'], previousEvidence: ParsedTurboTask['evidence'], currentComplete: Set<string>, previousComplete: Set<string>): TurboHashEvidence[] {
  const output: TurboHashEvidence[] = []
  for (const field of [...new Set([...currentEvidence.keys(), ...previousEvidence.keys()])].sort()) {
    const after = currentEvidence.get(field)
    const prior = previousEvidence.get(field)
    if (after?.digest === prior?.digest) {
      continue
    }
    output.push({
      category: (after ?? prior)!.category,
      field,
      change: after && prior ? 'changed' : (!after && !currentComplete.has(group(field))) || (!prior && !previousComplete.has(group(field))) ? 'unknown' : after ? 'added' : 'removed',
      beforeDigest: prior?.digest ?? null,
      afterDigest: after?.digest ?? null,
    })
  }
  return output
}

function differences(current: ParsedTurboTask, previous: ParsedTurboTask): TurboHashEvidence[] {
  const output = compareEvidence(current.evidence, previous.evidence, current.completeGroups, previous.completeGroups)
  if (current.hash !== previous.hash) {
    output.push({ category: 'task-hash', field: 'task.hash', change: current.hash && previous.hash ? 'changed' : 'unknown', beforeDigest: previous.hash, afterDigest: current.hash })
  }
  return output
}

export function analyzeTask(id: string, now: ParsedTurboSummary, before?: ParsedTurboSummary): TurboTaskAnalysis {
  const current = now.tasks.get(id)
  const previous = before?.tasks.get(id)
  const supported = now.supported && (!before || before.supported)
  let comparison: TurboTaskAnalysis['comparison'] = before ? 'unknown' : 'not-requested'
  if (before && supported) {
    comparison = !current
      ? now.ambiguous ? 'unknown' : 'removed'
      : !previous
          ? before.ambiguous ? 'unknown' : 'added'
          : current.hash && previous.hash ? current.hash === previous.hash ? 'unchanged' : 'changed' : 'unknown'
  }
  return {
    taskId: id,
    cache: current?.cache ?? 'unknown',
    durationMs: current?.duration ?? null,
    exitCode: current?.exitCode ?? null,
    hashDigest: current?.hash ?? null,
    comparison,
    previousDurationMs: previous?.duration ?? null,
    durationDeltaMs: current?.duration != null && previous?.duration != null ? current.duration - previous.duration : null,
    evidence: before && current && previous && supported ? differences(current, previous) : [],
  }
}
