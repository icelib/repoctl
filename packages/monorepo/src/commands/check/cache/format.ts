import type { TurboRunAnalysis } from './types'
import { localize } from '../../../i18n'

function label(value: string, markdown: boolean) {
  return markdown ? value.replace(/[\\`*_{}[\]()#+.!|<>~-]/gu, '\\$&') : value
}

export function formatTurboAnalysis(report: TurboRunAnalysis, markdown = false) {
  const { totals, criticalPath } = report
  const display = (value: string) => label(value, markdown)
  const rate = totals.hitRate === null ? 'unknown' : `${(totals.hitRate * 100).toFixed(1)}%`
  return [
    ...(markdown ? [localize('# Turbo cache analysis', '# Turbo 缓存分析'), ''] : []),
    localize(`Cache: ${totals.hits} hit, ${totals.misses} miss, ${totals.unknownCache} unknown; hit rate ${rate} among known results.`, `缓存：${totals.hits} 命中，${totals.misses} 未命中，${totals.unknownCache} 未知；已知结果命中率 ${rate}。`),
    '',
    localize('Slowest recorded tasks:', '耗时最长的已记录任务：'),
    ...report.slowest.map(task => `- ${display(task.taskId)}: ${task.durationMs} ms`),
    '',
    criticalPath.available
      ? localize(`Longest measured dependency chain: ${criticalPath.taskIds.map(display).join(' → ')}; ${criticalPath.durationMs} ms of task time. Recorded span: ${criticalPath.observedSpanMs} ms.`, `最长实测依赖链：${criticalPath.taskIds.map(display).join(' → ')}；任务总耗时 ${criticalPath.durationMs} ms，记录跨度 ${criticalPath.observedSpanMs} ms。`)
      : localize(`Dependency critical path unavailable: ${criticalPath.reason}.`, `无法计算依赖关键路径：${criticalPath.reason}。`),
    localize('Task time excludes scheduling gaps, setup and contention; it is not a wall-clock optimization estimate.', '任务耗时不包含调度间隔、准备和资源竞争，不代表可节省的实际运行时间。'),
    '',
    ...report.globalEvidence.map(item => `- ${item.category}: ${display(item.field)} (${item.change})`),
    ...report.tasks.flatMap(task => [
      `- ${display(task.taskId)}: cache ${task.cache}; comparison ${task.comparison}${task.durationDeltaMs === null ? '' : `; Δ ${task.durationDeltaMs} ms`}`,
      ...task.evidence.map(item => `  ${item.category}: ${display(item.field)} (${item.change})`),
    ]),
    '',
    localize('Differences are recorded evidence; a summary cannot prove a unique cause of a cache miss.', '差异来自摘要记录，不能据此断定缓存未命中的唯一原因。'),
    ...report.limitations.map(item => `! ${item.code}: ${item.summary}${item.taskId ? ` / ${display(item.taskId)}` : ''}${item.field ? ` / ${display(item.field)}` : ''}`),
  ].join('\n')
}
