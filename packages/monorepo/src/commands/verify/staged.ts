import type { StagedTypecheckOptions } from './types'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { runPnpmCommand } from './run'

const typecheckExtensions = new Set(['.ts', '.tsx', '.mts', '.cts', '.vue', '.astro', '.mdx'])
const typecheckBasenames = new Set(['package.json'])
const gitDirName = '.git'

function readStagedFiles(cwd: string) {
  return execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], { cwd, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
}

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

function resolveTypecheckWorkspaceDir(filePath: string, workspaceRoot: string) {
  let current = path.dirname(path.resolve(workspaceRoot, filePath))

  while (current === workspaceRoot || current.startsWith(`${workspaceRoot}${path.sep}`)) {
    if (hasTypecheckScript(current)) {
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
 * 当前识别的扩展名：`.ts`、`.tsx`、`.mts`、`.cts`、`.vue`。
 *
 * @param stagedFiles 相对于 cwd 的暂存区文件路径列表；省略时从 Git 根目录读取暂存区
 * @param options 运行参数
 */
export function verifyStagedTypecheck(stagedFiles: string[] | undefined, options: StagedTypecheckOptions = {}) {
  const cwd = path.resolve(options.cwd ?? process.cwd())
  const workspaceRoot = findRepositoryRoot(cwd)
  const spawn = options.spawn ?? spawnSync
  const files = stagedFiles === undefined
    ? readStagedFiles(workspaceRoot).map(file => path.resolve(workspaceRoot, file))
    : stagedFiles.map(file => path.resolve(cwd, file))
  const workspaceDirs = [...new Set(
    files
      .filter((file) => {
        const basename = path.basename(file)
        return typecheckExtensions.has(path.extname(file)) || typecheckBasenames.has(basename)
      })
      .map(file => resolveTypecheckWorkspaceDir(file, workspaceRoot)),
  )]

  if (workspaceDirs.length === 0) {
    return
  }

  for (const workspaceDir of workspaceDirs) {
    const label = path.relative(cwd, workspaceDir) || '.'
    runPnpmCommand(cwd, `[staged:typecheck] ${label}`, ['--dir', workspaceDir, 'typecheck'], spawn)
  }
}
