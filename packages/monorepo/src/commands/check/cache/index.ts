import type { TurboAnalysisOptions, TurboRunAnalysis } from './types'
import { analyzeTask, compareEvidence } from './compare'
import { criticalPath } from './critical-path'
import { readTurboSummary } from './parse'

export type { TurboAnalysisLimitation, TurboAnalysisOptions, TurboCriticalPath, TurboHashEvidence, TurboRunAnalysis, TurboTaskAnalysis } from './types'

/** Analyze existing evidence only. Never invoke Turbo, package scripts, or cache mutation. */
export async function analyzeTurboRuns(current: string, options: TurboAnalysisOptions = {}): Promise<TurboRunAnalysis> {
  const slowest = options.slowest ?? 10
  if (!Number.isInteger(slowest) || slowest < 1 || slowest > 100) {
    throw new Error('Slow task count must be an integer from 1 to 100.')
  }
  const now = await readTurboSummary(current, 'current')
  const before = options.previous === undefined ? undefined : await readTurboSummary(options.previous, 'previous')
  const ids = [...new Set([...now.tasks.keys(), ...(before?.tasks.keys() ?? [])])].sort()
  const globalEvidence = before && now.supported && before.supported
    ? compareEvidence(now.globalEvidence, before.globalEvidence, now.completeGroups, before.completeGroups)
    : []
  const globalChanged = globalEvidence.some(item => item.change !== 'unknown')
  const tasks = ids.map(id => analyzeTask(id, now, before))
  const currentTasks = [...now.tasks.values()]
  const hits = currentTasks.filter(task => task.cache === 'hit').length
  const misses = currentTasks.filter(task => task.cache === 'miss').length
  const limitations = [...now.limitations, ...(before?.limitations ?? [])]
  for (const task of tasks) {
    if (task.cache === 'miss' && task.comparison === 'unchanged') {
      limitations.push({ code: 'cache_miss_with_unchanged_hash', summary: 'current', taskId: task.taskId })
    }
    if (task.comparison === 'changed' && !globalChanged && !task.evidence.some(item => item.category !== 'task-hash' && item.change !== 'unknown')) {
      limitations.push({ code: 'hash_changed_without_explanation', summary: 'current', taskId: task.taskId })
    }
  }
  return {
    schemaVersion: 1,
    kind: 'turbo-cache-analysis',
    current: { supportedSchema: now.supported, turboVersion: now.turboVersion },
    previous: before ? { supportedSchema: before.supported, turboVersion: before.turboVersion } : null,
    totals: { tasks: currentTasks.length, hits, misses, unknownCache: currentTasks.length - hits - misses, hitRate: hits + misses ? hits / (hits + misses) : null },
    tasks,
    globalEvidence,
    slowest: currentTasks.filter(task => task.duration !== null).map(task => ({ taskId: task.id, durationMs: task.duration! })).sort((a, b) => b.durationMs - a.durationMs || a.taskId.localeCompare(b.taskId)).slice(0, slowest),
    criticalPath: criticalPath(now),
    limitations,
  }
}
