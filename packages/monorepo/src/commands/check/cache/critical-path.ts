import type { ParsedTurboSummary, TurboCriticalPath } from './types'

const unavailable = (reason: TurboCriticalPath['reason']): TurboCriticalPath => ({ available: false, reason, taskIds: [], durationMs: null, observedSpanMs: null })

/** Longest measured dependency chain, not a claim about total wall-clock performance. */
export function criticalPath(summary: ParsedTurboSummary): TurboCriticalPath {
  if (!summary.supported) {
    return unavailable('unsupported-schema')
  }
  if (summary.ambiguous) {
    return unavailable('ambiguous-tasks')
  }
  const tasks = [...summary.tasks.values()].sort((a, b) => a.id.localeCompare(b.id))
  if (!tasks.length) {
    return unavailable('no-tasks')
  }
  if (tasks.some(task => task.duration === null || task.start === null || task.end === null)) {
    return unavailable('missing-timing')
  }
  if (tasks.some(task => !task.dependencies || task.dependencies.some(id => !summary.tasks.has(id)))) {
    return unavailable('missing-dependencies')
  }
  const indegree = new Map(tasks.map(task => [task.id, task.dependencies!.length]))
  const children = new Map(tasks.map(task => [task.id, [] as string[]]))
  for (const task of tasks) {
    for (const dependency of task.dependencies!) {
      children.get(dependency)!.push(task.id)
    }
  }
  const ready = tasks.filter(task => !task.dependencies!.length).map(task => task.id)
  const distance = new Map<string, number>()
  const parent = new Map<string, string>()
  let visited = 0
  let overlapping = false
  // Tasks and adjacency lists are stable, so equal-duration chains have stable representatives.
  for (let cursor = 0; cursor < ready.length; cursor++) {
    const id = ready[cursor]!
    const task = summary.tasks.get(id)!
    const total = (distance.get(id) ?? 0) + task.duration!
    if (!Number.isSafeInteger(total)) {
      return unavailable('timing-overflow')
    }
    distance.set(id, total)
    visited++
    for (const child of children.get(id)!) {
      if (task.end! > summary.tasks.get(child)!.start!) {
        overlapping = true
      }
      if (total > (distance.get(child) ?? -1)) {
        distance.set(child, total)
        parent.set(child, id)
      }
      const count = indegree.get(child)! - 1
      indegree.set(child, count)
      if (!count) {
        ready.push(child)
      }
    }
  }
  if (visited !== tasks.length) {
    return unavailable('dependency-cycle')
  }
  if (overlapping) {
    return unavailable('overlapping-dependency')
  }
  const longest = tasks.reduce((best, task) => distance.get(task.id)! > distance.get(best.id)! ? task : best)
  const chain: string[] = []
  for (let id: string | undefined = longest.id; id !== undefined; id = parent.get(id)) {
    chain.push(id)
  }
  return {
    available: true,
    reason: 'complete',
    taskIds: chain.reverse(),
    durationMs: distance.get(longest.id)!,
    observedSpanMs: tasks.reduce((latest, task) => Math.max(latest, task.end!), 0) - tasks.reduce((earliest, task) => Math.min(earliest, task.start!), Infinity),
  }
}
