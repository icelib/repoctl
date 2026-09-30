import type { Buffer } from 'node:buffer'
import type { SpawnSyncReturns } from 'node:child_process'
import type { CommitMsgVerifyOptions, PreCommitVerifyOptions, PrePushVerifyOptions } from './types'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { resolveToolingConfig } from '../../core/config'
import { runPnpmCommand } from './run'

export { verifyStagedTypecheck } from './staged'

export type * from './types'

const zeroSha = '0'.repeat(40)
const whitespacePattern = /\s+/
const defaultWorkspaceOrder = [
  'packages/create-icebreaker',
  'packages/create-repoctl',
  'packages/monorepo',
  'packages/monorepo-templates',
  'packages/repoctl',
  'templates/cli',
  'templates/client',
  'templates/server',
  'templates/tsdown',
  'templates/vitepress',
  'templates/nimbus',
  'templates/vue-lib',
].sort((left, right) => right.length - left.length)

function getPackageScripts(dir: string, cwd: string) {
  const packageJsonPath = path.join(cwd, dir, 'package.json')
  if (!fs.existsSync(packageJsonPath)) {
    return {}
  }
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  return packageJson.scripts ?? {}
}

function getRootLevelTasksForFile(filePath: string) {
  const basename = path.basename(filePath)
  if (filePath.startsWith('.github/')) {
    return ['build', 'test', 'tsd']
  }
  if (filePath.startsWith('.husky/')) {
    return ['build', 'test', 'tsd']
  }
  if (filePath === 'package.json' || filePath === 'pnpm-lock.yaml' || filePath === 'turbo.json' || filePath === 'pnpm-workspace.yaml') {
    return ['build', 'test', 'tsd']
  }
  if (
    basename.startsWith('tsconfig')
    || filePath === 'commitlint.config.ts'
    || filePath === 'eslint.config.js'
    || filePath === 'lint-staged.config.js'
    || filePath === 'stylelint.config.js'
    || filePath === 'vitest.config.ts'
    || filePath.startsWith('scripts/')
  ) {
    return ['build', 'test', 'tsd']
  }
  return []
}

function resolveWorkspaceDir(filePath: string, workspaces: string[]) {
  const normalized = filePath.split(path.sep).join('/')
  for (const workspace of workspaces) {
    if (normalized === workspace || normalized.startsWith(`${workspace}/`)) {
      return workspace
    }
  }
  return null
}

function getChangedFilesForRange(base: string, head: string, cwd: string, execFile: typeof execFileSync) {
  const output = execFile('git', ['diff', '--name-only', '--diff-filter=ACMR', `${base}...${head}`], {
    cwd,
    encoding: 'utf8',
  })
  return output.split('\n').filter(Boolean)
}

function getChangedFilesForNewRemote(head: string, cwd: string, execFile: typeof execFileSync) {
  const emptyTree = execFile('git', ['hash-object', '-t', 'tree', '--stdin'], {
    cwd,
    encoding: 'utf8',
    input: '',
  }).trim()
  const output = execFile('git', ['diff', '--name-only', '--diff-filter=ACMR', emptyTree, head], {
    cwd,
    encoding: 'utf8',
  })
  return output.split('\n').filter(Boolean)
}

function runShellCommand(cwd: string, label: string, command: string, spawn: typeof spawnSync) {
  process.stdout.write(`${label}\n`)
  const result = spawn('sh', ['-lc', command], {
    cwd,
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

async function readHookStdin() {
  if (process.stdin.isTTY) {
    return ''
  }

  process.stdin.setEncoding('utf8')
  let output = ''

  try {
    for await (const chunk of process.stdin) {
      output += chunk
    }
  }
  catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code !== 'EAGAIN') {
      throw error
    }
  }

  return output.trim()
}

/**
 * 执行 pre-push 校验。
 *
 * 该函数会根据 push 范围内的改动文件，推导需要运行的 workspace 任务：
 * - workspace 内改动：按包执行 `build` / `test` / `tsd`
 * - 根级配置改动：在仓库根执行 `build` / `test` / `tsd`
 * - 无论改动范围如何，都会强制在仓库根执行整仓 `lint` 与 `typecheck`
 *
 * @param options pre-push 运行参数
 * @returns Promise<void>
 */
export async function verifyPrePush(options: PrePushVerifyOptions = {}) {
  const cwd = options.cwd ?? process.cwd()
  const execFile = options.execFile ?? execFileSync
  const spawn = options.spawn ?? spawnSync
  const workspaces = options.workspaces ?? defaultWorkspaceOrder
  const hookStdin = options.stdinText ?? await readHookStdin()
  const hookLines = hookStdin.length > 0 ? hookStdin.split('\n') : []

  const tasksByWorkspace = new Map<string, Set<string>>()
  const rootTasks = new Set<string>(['lint', 'typecheck'])

  for (const line of hookLines) {
    const [, localSha, , remoteSha] = line.trim().split(whitespacePattern)
    if (!localSha || localSha === zeroSha) {
      continue
    }

    const changedFiles = remoteSha && remoteSha !== zeroSha
      ? getChangedFilesForRange(remoteSha, localSha, cwd, execFile)
      : getChangedFilesForNewRemote(localSha, cwd, execFile)

    for (const file of changedFiles) {
      const workspace = resolveWorkspaceDir(file, workspaces)
      if (workspace) {
        const tasks = tasksByWorkspace.get(workspace) ?? new Set()
        tasks.add('build')
        tasks.add('test')
        tasks.add('tsd')
        tasksByWorkspace.set(workspace, tasks)
        continue
      }

      for (const task of getRootLevelTasksForFile(file)) {
        rootTasks.add(task)
      }
    }
  }

  for (const [workspace, tasks] of tasksByWorkspace) {
    const scripts = getPackageScripts(workspace, cwd)
    for (const task of [...tasks]) {
      if (typeof scripts[task] !== 'string' || scripts[task].length === 0) {
        tasks.delete(task)
      }
    }
  }

  if (tasksByWorkspace.size === 0 && rootTasks.size === 0) {
    return
  }

  for (const [workspace, tasks] of [...tasksByWorkspace.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    for (const task of ['build', 'test', 'tsd']) {
      if (!tasks.has(task)) {
        continue
      }
      runPnpmCommand(cwd, `[pre-push:${task}] ${workspace}`, ['--dir', workspace, task], spawn)
    }
  }

  for (const task of ['lint', 'typecheck', 'build', 'test', 'tsd']) {
    if (!rootTasks.has(task)) {
      continue
    }
    runPnpmCommand(cwd, `[pre-push:${task}] .`, [task], spawn)
  }
}

/**
 * 执行 commit-msg 校验。
 *
 * 优先读取 `tooling.husky.commitMsgCommand`；若未配置，则回退到
 * `pnpm exec commitlint --edit <editFile>`。
 *
 * @param options commit-msg 运行参数
 */
export async function verifyCommitMsg(options: CommitMsgVerifyOptions) {
  const cwd = options.cwd ?? process.cwd()
  const spawn = options.spawn ?? spawnSync
  const toolingConfig = await resolveToolingConfig(cwd)
  const command = toolingConfig.husky?.commitMsgCommand?.replaceAll('{editFile}', options.editFile)

  if (command) {
    runShellCommand(cwd, `[commit-msg] ${options.editFile}`, command, spawn)
    return
  }

  runPnpmCommand(cwd, `[commit-msg] ${options.editFile}`, ['exec', 'commitlint', '--edit', options.editFile], spawn)
}

/**
 * 执行 pre-commit 校验。
 *
 * 优先读取 `tooling.husky.preCommitCommand`；若未配置，则回退到
 * `pnpm exec lint-staged`。
 *
 * @param options pre-commit 运行参数
 */
export async function verifyPreCommit(options: PreCommitVerifyOptions = {}) {
  const cwd = options.cwd ?? process.cwd()
  const spawn = options.spawn ?? spawnSync
  const toolingConfig = await resolveToolingConfig(cwd)
  const command = toolingConfig.husky?.preCommitCommand

  if (command) {
    runShellCommand(cwd, '[pre-commit] lint-staged', command, spawn)
    return
  }

  runPnpmCommand(cwd, '[pre-commit] lint-staged', ['exec', 'lint-staged'], spawn)
}

/**
 * 用于测试场景的 `spawnSync` 返回值类型别名。
 */
export type VerifySpawnResult = SpawnSyncReturns<Buffer>
