import type { CheckExecutionOptions, CheckExecutionReport, CheckExecutionTask } from './types'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { resolveFullWorkspaceCheckPlan, resolveRecommendedCheckPlan } from '../check'
import { executeCheckTask, signalExitCode } from './process'

/** Run checks without exiting the caller, retaining every completed and skipped stage. */
export async function runCheckWithReport(options: CheckExecutionOptions): Promise<CheckExecutionReport> {
  const start = performance.now()
  const startedAt = new Date().toISOString()
  const plan = options.full && !options.editFile
    ? await resolveFullWorkspaceCheckPlan(options.cwd)
    : resolveRecommendedCheckPlan(options)
  const tasks: CheckExecutionTask[] = plan.commands.map(command => ({
    name: command.name,
    command: command.command,
    executable: plan.mode === 'full' ? 'pnpm' : process.execPath,
    args: plan.mode === 'full'
      ? [command.name]
      : [fileURLToPath(import.meta.resolve('@icebreakers/monorepo/cli')), 'verify', command.name, ...(options.editFile ? [options.editFile] : [])],
    cwd: plan.cwd,
    status: 'skipped',
    startedAt: null,
    endedAt: null,
    durationMs: 0,
    exitCode: null,
    signal: null,
    reason: 'not_run',
  }))
  let status: CheckExecutionReport['status'] = 'success'
  let exitCode = 0

  for (const task of tasks) {
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
  }
}
