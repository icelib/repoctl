import type { CheckExecutionOptions, CheckExecutionReport, CheckExecutionTask } from './types'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { resolveFullWorkspaceCheckPlan, resolveRecommendedCheckPlan } from '../check'
import { resolveAffectedCheckPlan } from './affected'
import { executeCheckTask, signalExitCode } from './process'

/** Run checks without exiting the caller, retaining every completed and skipped stage. */
export async function runCheckWithReport(options: CheckExecutionOptions): Promise<CheckExecutionReport> {
  const start = performance.now()
  const startedAt = new Date().toISOString()
  if (options.affected && (options.full || options.staged || options.editFile)) {
    throw new Error('Affected mode cannot be combined with full, staged or editFile')
  }
  if (!options.affected && (options.base || options.head || options.filters || options.globalInputs)) {
    throw new Error('base, head, filters and globalInputs require affected mode')
  }
  const affectedPlan = options.affected ? await resolveAffectedCheckPlan(options) : undefined
  const plan = affectedPlan ?? (options.full && !options.editFile
    ? await resolveFullWorkspaceCheckPlan(options.cwd)
    : resolveRecommendedCheckPlan(options))
  const tasks: CheckExecutionTask[] = plan.commands.map((command, index) => ({
    name: command.name,
    command: command.command,
    executable: affectedPlan?.commands[index]?.executable ?? (plan.mode === 'full' ? 'pnpm' : process.execPath),
    args: affectedPlan?.commands[index]?.args ?? (plan.mode === 'full'
      ? [command.name]
      : [fileURLToPath(import.meta.resolve('@icebreakers/monorepo/cli')), 'verify', command.name, ...(options.editFile ? [options.editFile] : [])]),
    cwd: plan.cwd,
    status: 'skipped',
    startedAt: null,
    endedAt: null,
    durationMs: 0,
    exitCode: null,
    signal: null,
    reason: affectedPlan?.commands[index]?.skipReason ?? 'not_run',
  }))
  if (affectedPlan) {
    process.stdout.write(`[affected:${affectedPlan.strategy}] ${affectedPlan.packages.filter(pkg => pkg.selected).map(pkg => pkg.id).join(', ') || '(none)'}\n`)
    for (const reason of affectedPlan.fallback) {
      process.stdout.write(`[affected:fallback] ${reason.code}\n`)
    }
  }
  let status: CheckExecutionReport['status'] = 'success'
  let exitCode = 0

  for (const task of tasks) {
    if (task.reason !== 'not_run') {
      process.stdout.write(`[check:${task.name}] skipped: ${task.reason}\n`)
      continue
    }
    if (options.signal?.aborted) {
      status = 'interrupted'
      exitCode = signalExitCode(options.signal.reason === 'SIGTERM' ? 'SIGTERM' : 'SIGINT')
      task.reason = 'interrupted_before_start'
      continue
    }
    if (status !== 'success') {
      task.reason = 'previous_task_failed'
      continue
    }
    if (task.name === 'staged-typecheck') {
      // The existing check --staged route passes no explicit file arguments.
      // Configured lint-staged typechecks run inside the preceding pre-commit stage.
      task.reason = 'no_explicit_staged_files'
      continue
    }
    delete task.reason
    await executeCheckTask(task, options.signal)
    if (task.status !== 'success') {
      status = task.status === 'interrupted' ? 'interrupted' : 'failed'
      exitCode = task.signal ? signalExitCode(task.signal) : task.exitCode ?? 1
    }
  }

  if (options.signal?.aborted && status === 'success') {
    status = 'interrupted'
    exitCode = signalExitCode(options.signal.reason === 'SIGTERM' ? 'SIGTERM' : 'SIGINT')
  }
  return {
    schemaVersion: 1,
    cwd: plan.cwd,
    mode: plan.mode,
    status,
    startedAt,
    endedAt: new Date().toISOString(),
    durationMs: Math.max(0, performance.now() - start),
    exitCode,
    tasks,
    ...(affectedPlan ? { affectedPlan } : {}),
  }
}
