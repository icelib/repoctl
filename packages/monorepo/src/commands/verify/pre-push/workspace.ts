import fs from 'node:fs'
import path from 'node:path'
import { clearWorkspaceCache, getWorkspaceData } from '../../../core/workspace'

export async function resolvePrePushWorkspaces(cwd: string, workspaces?: string[]) {
  if (workspaces === undefined) {
    // A programmatic caller may have added packages since its previous push.
    clearWorkspaceCache()
    const data = await getWorkspaceData(cwd, { ignorePrivatePackage: false, ignoreRootPackage: true })
    cwd = data.workspaceDir
    workspaces = data.packages.map(pkg => path.relative(cwd, pkg.rootDir))
  }

  return {
    cwd,
    workspaces: [...new Set(workspaces.map(dir => path.relative(cwd, path.resolve(cwd, dir)).split(path.sep).join('/')))]
      .filter(dir => dir !== '' && dir !== '..' && !dir.startsWith('../'))
      .sort((left, right) => right.length - left.length || left.localeCompare(right)),
  }
}

export function getPackageScripts(dir: string, cwd: string) {
  const packageJsonPath = path.join(cwd, dir, 'package.json')
  if (!fs.existsSync(packageJsonPath)) {
    return {}
  }
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).scripts ?? {}
}

export function getRootLevelTasksForFile(filePath: string) {
  const basename = path.basename(filePath)
  if (
    filePath.startsWith('.github/')
    || filePath.startsWith('.husky/')
    || basename === 'package.json'
    || filePath === 'pnpm-lock.yaml'
    || filePath === 'turbo.json'
    || filePath === 'pnpm-workspace.yaml'
    || basename.startsWith('tsconfig')
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

export function resolveWorkspaceDir(filePath: string, workspaces: string[]) {
  const normalized = filePath.split(path.sep).join('/')
  return workspaces.find(workspace => normalized === workspace || normalized.startsWith(`${workspace}/`))
}
