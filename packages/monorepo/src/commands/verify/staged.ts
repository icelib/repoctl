import type { StagedTypecheckOptions } from './types'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { runPnpmCommand } from './run'

const gitDirName = '.git'
const typecheckExtensions = new Set(['.ts', '.tsx', '.mts', '.cts', '.vue', '.astro', '.mdx'])
const typecheckBasenames = new Set(['package.json'])

function hasTypecheckScript(dir: string) {
  const packageJsonPath = path.join(dir, 'package.json')
  if (!fs.existsSync(packageJsonPath)) {
    return false
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
    return typeof packageJson.scripts?.typecheck === 'string' && packageJson.scripts.typecheck.length > 0
  }
  catch {
    return false
  }
}

function findRepositoryRoot(startDir: string) {
  let current = path.resolve(startDir)

  while (true) {
    if (fs.existsSync(path.join(current, gitDirName))) {
      return current
    }

    const next = path.dirname(current)
    if (next === current) {
      return path.resolve(startDir)
    }
    current = next
  }
}

function resolveTypecheckWorkspaceDir(filePath: string, cwd: string) {
  const workspaceRoot = findRepositoryRoot(cwd)
  let current = path.dirname(path.resolve(cwd, filePath))

  while (current.startsWith(workspaceRoot)) {
    if (current !== cwd && hasTypecheckScript(current)) {
      return current
    }

    const next = path.dirname(current)
    if (next === current) {
      break
    }
    current = next
  }

  return workspaceRoot
}

/**
 * 对暂存区中涉及类型检查的文件，按最近的 workspace 归属执行 `typecheck`。
 *
 * 当前识别的扩展名：`.ts`、`.tsx`、`.mts`、`.cts`、`.vue`、`.astro`、`.mdx`。
 *
 * @param stagedFiles 暂存区文件路径列表
 * @param options 运行参数
 */
export function verifyStagedTypecheck(stagedFiles: string[], options: StagedTypecheckOptions = {}) {
  const cwd = options.cwd ?? process.cwd()
  const spawn = options.spawn ?? spawnSync
  let workspaceDirs = [...new Set(
    stagedFiles
      .filter((file) => {
        const basename = path.basename(file)
        return typecheckExtensions.has(path.extname(file)) || typecheckBasenames.has(basename)
      })
      .map(file => resolveTypecheckWorkspaceDir(file, cwd)),
  )]

  if (workspaceDirs.length === 0) {
    return
  }

  if (workspaceDirs.includes(cwd)) {
    workspaceDirs = [cwd]
  }

  for (const workspaceDir of workspaceDirs) {
    const label = path.relative(cwd, workspaceDir) || '.'
    runPnpmCommand(cwd, `[lint-staged:typecheck] ${label}`, ['--dir', workspaceDir, 'typecheck'], spawn)
  }
}
