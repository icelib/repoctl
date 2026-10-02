import type { PrePushVerifyOptions } from '../types'
import { execFileSync, spawnSync } from 'node:child_process'
import process from 'node:process'
import { runPnpmCommand } from '../run'
import { getPushChangedFiles, readHookStdin } from './git'
import { getPackageScripts, getRootLevelTasksForFile, resolvePrePushWorkspaces, resolveWorkspaceDir } from './workspace'

/**
 * 根据 push 范围校验改动所属的 pnpm workspace（含 private 包，不重复运行根包）。
 * 按包执行已有 build/test/tsd，根配置变更补跑根任务，始终执行根 lint/typecheck。
 * 显式 workspaces 覆盖自动发现；只按文件归属选择，不扩展依赖闭包。
 */
export async function verifyPrePush(options: PrePushVerifyOptions = {}) {
  const { cwd, workspaces } = await resolvePrePushWorkspaces(options.cwd ?? process.cwd(), options.workspaces)
  const spawn = options.spawn ?? spawnSync
  const hookStdin = options.stdinText ?? await readHookStdin()
  const changedFiles = getPushChangedFiles(hookStdin, cwd, options.execFile ?? execFileSync)
  const tasksByWorkspace = new Map<string, Set<string>>()
  const rootTasks = new Set<string>(['lint', 'typecheck'])

  for (const file of changedFiles) {
    const workspace = resolveWorkspaceDir(file, workspaces)
    if (workspace) {
      tasksByWorkspace.set(workspace, new Set(['build', 'test', 'tsd']))
      continue
    }
    // A removed package manifest no longer has a discovered owner. It still
    // changes the workspace, so use the same full fallback as root metadata.
    for (const task of getRootLevelTasksForFile(file)) {
      rootTasks.add(task)
    }
  }

  for (const [workspace, tasks] of [...tasksByWorkspace].sort(([left], [right]) => left.localeCompare(right))) {
    const scripts = getPackageScripts(workspace, cwd)
    for (const task of ['build', 'test', 'tsd']) {
      if (tasks.has(task) && typeof scripts[task] === 'string' && scripts[task].length > 0) {
        runPnpmCommand(cwd, `[pre-push:${task}] ${workspace}`, ['--dir', workspace, task], spawn)
      }
    }
  }

  for (const task of ['lint', 'typecheck', 'build', 'test', 'tsd']) {
    if (rootTasks.has(task)) {
      runPnpmCommand(cwd, `[pre-push:${task}] .`, [task], spawn)
    }
  }
}
