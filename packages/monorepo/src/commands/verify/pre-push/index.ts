import type { PrePushVerifyOptions } from '../types'
import { execFileSync, spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { clearWorkspaceCache, getWorkspaceData } from '../../../core/workspace'
import { resolveWorkspaceDirectory, resolveWorkspacePath } from '../../../core/workspace/paths'
import { readHookStdin } from '../git'
import { runPnpmCommand } from '../run'
import { normalizeWorkspaceDirs, planVerificationTasks } from '../tasks'
import { assertPushActive, PushCommandFailure, runPushCommand } from './commands'
import { getPushContext, relativeChangedFiles, relativeInside } from './context'
import { createPushEnvironment } from './environment'
import { planPushCommits } from './refs'
import { withPushSnapshot } from './snapshot'

/**
 * 按实际 pnpm workspace 与 push 范围执行校验（包括 private 包）。
 *
 * 全局顺序为 build → lint → typecheck → tsd → test；lint/typecheck 始终覆盖
 * 整仓。根配置影响整仓，其根任务优先且不重复运行同类子包任务。缺少根脚本时，
 * 回退到具有对应脚本的 workspace。显式 workspaces 仍可覆盖自动发现结果。
 */
async function verifyLocal(options: PrePushVerifyOptions) {
  const inputCwd = path.resolve(options.cwd ?? process.cwd())
  let cwd = inputCwd
  let workspaceDirs = options.workspaces
  if (workspaceDirs === undefined) {
    clearWorkspaceCache()
    const workspace = await getWorkspaceData(cwd, { ignorePrivatePackage: false })
    cwd = workspace.workspaceDir
    workspaceDirs = workspace.packages.map(pkg => pkg.rootDir)
  }
  else {
    // Explicit paths are relative to the caller's cwd, which may itself be an
    // alias. Compare physical identities with Git's tracked paths; preserve
    // missing final segments so deleted packages retain their ownership.
    cwd = await resolveWorkspaceDirectory(inputCwd)
    workspaceDirs = await Promise.all(workspaceDirs.map(dir => resolveWorkspacePath(path.resolve(inputCwd, dir))))
  }

  const workspaces = normalizeWorkspaceDirs(workspaceDirs, cwd)
  const tasks = planVerificationTasks([], workspaces, cwd)
  const spawn = options.spawn ?? spawnSync
  for (const { workspace, task } of tasks) {
    const args = workspace === '.' ? [task] : ['--dir', workspace, task]
    runPnpmCommand(cwd, `[pre-push:${task}] ${workspace}`, args, spawn)
  }
}

/** Verify each pushed commit in a clone before allowing the push to continue. */
export async function verifyPrePush(options: PrePushVerifyOptions = {}) {
  const stdin = options.stdinText ?? await readHookStdin()
  if (!stdin.trim()) {
    return verifyLocal(options)
  }
  const execFile = options.execFile ?? execFileSync
  const inputCwd = path.resolve(options.cwd ?? process.cwd())
  const physicalCwd = await resolveWorkspaceDirectory(inputCwd)
  const gitRoot = await resolveWorkspaceDirectory(execFile('git', ['rev-parse', '--show-toplevel'], { cwd: physicalCwd, encoding: 'utf8' }).trim())
  const relativeCwd = relativeInside(gitRoot, physicalCwd)
  if (relativeCwd === undefined) {
    throw new Error('The verification directory is outside the Git repository.')
  }
  const commits = planPushCommits(stdin, gitRoot, execFile)
  if (!commits.length) {
    return verifyLocal(options)
  }
  const explicit = options.workspaces === undefined
    ? undefined
    : normalizeWorkspaceDirs(await Promise.all(options.workspaces.map(dir => resolveWorkspacePath(path.resolve(inputCwd, dir)))), physicalCwd)
  const environment = createPushEnvironment(gitRoot, execFile)
  const controller = new AbortController()
  const onInterrupt = () => controller.abort('SIGINT')
  const onTerminate = () => controller.abort('SIGTERM')
  process.on('SIGINT', onInterrupt)
  process.on('SIGTERM', onTerminate)
  let commandFailure: PushCommandFailure | undefined
  try {
    for (const pushed of commits) {
      assertPushActive(controller.signal)
      process.stdout.write(`[pre-push:commit] ${pushed.commit} ${pushed.refs.join(', ')}\n`)
      await withPushSnapshot(gitRoot, pushed.commit, environment, controller.signal, execFile, async (snapshotRoot) => {
        clearWorkspaceCache()
        const context = await getPushContext(snapshotRoot, relativeCwd, explicit)
        if (context.needsInstall) {
          process.stdout.write('[pre-push:install] Preparing committed dependencies.\n')
          for (const directory of context.installDirectories) {
            await runPushCommand('pnpm', ['install', '--frozen-lockfile'], directory, environment, controller.signal, options.spawn)
          }
        }
        const files = relativeChangedFiles(pushed.changedFiles, snapshotRoot, context.cwd)
        for (const { workspace, task } of planVerificationTasks(files, context.workspaces, context.cwd)) {
          const args = workspace === '.' ? [task] : ['--dir', workspace, task]
          process.stdout.write(`[pre-push:${task}] ${workspace}\n`)
          await runPushCommand('pnpm', args, context.cwd, environment, controller.signal, options.spawn)
        }
      })
    }
  }
  catch (error) {
    if (error instanceof PushCommandFailure) {
      commandFailure = error
    }
    else {
      throw error
    }
  }
  finally {
    process.off('SIGINT', onInterrupt)
    process.off('SIGTERM', onTerminate)
    clearWorkspaceCache()
  }
  if (commandFailure) {
    process.stderr.write(`${commandFailure.message}\n`)
    process.exit(commandFailure.exitCode)
  }
}
