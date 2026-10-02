import fs from 'node:fs'
import path from 'node:path'

export const verificationOrder = ['build', 'lint', 'typecheck', 'tsd', 'test'] as const
export type VerificationTask = typeof verificationOrder[number]

interface WorkspacePackageInfo {
  dir: string
  name?: string
  dependencies: string[]
}

export function getPackageScripts(dir: string, cwd: string): Record<string, string> {
  const packageJsonPath = path.join(cwd, dir, 'package.json')
  if (!fs.existsSync(packageJsonPath)) {
    return {}
  }
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  return packageJson.scripts ?? {}
}

function getWorkspacePackageInfo(dir: string, cwd: string): WorkspacePackageInfo {
  const packageJsonPath = path.join(cwd, dir, 'package.json')
  if (!fs.existsSync(packageJsonPath)) {
    return { dir, dependencies: [] }
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
    name?: unknown
    dependencies?: Record<string, unknown>
    devDependencies?: Record<string, unknown>
    optionalDependencies?: Record<string, unknown>
    peerDependencies?: Record<string, unknown>
  }
  const dependencyNames = new Set<string>()
  for (const group of [
    packageJson.dependencies,
    packageJson.devDependencies,
    packageJson.optionalDependencies,
    packageJson.peerDependencies,
  ]) {
    for (const name of Object.keys(group ?? {})) {
      dependencyNames.add(name)
    }
  }

  return {
    dir,
    ...(typeof packageJson.name === 'string' ? { name: packageJson.name } : {}),
    dependencies: [...dependencyNames],
  }
}

function createWorkspaceDependencyGraph(workspaces: string[], cwd: string) {
  const packages = workspaces.map(dir => getWorkspacePackageInfo(dir, cwd))
  const byName = new Map<string, WorkspacePackageInfo>()
  for (const pkg of packages) {
    if (pkg.name) {
      byName.set(pkg.name, pkg)
    }
  }

  return new Map(packages.map((pkg) => {
    const dependencies = pkg.dependencies
      .map(name => byName.get(name)?.dir)
      .filter((dir): dir is string => Boolean(dir))
    return [pkg.dir, dependencies] as const
  }))
}

function sortWorkspaceTasks(workspaces: string[], dependencyGraph: Map<string, string[]>) {
  const selected = new Set(workspaces)
  const sorted: string[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>()

  const visit = (workspace: string) => {
    if (visited.has(workspace)) {
      return
    }
    // A dependency cycle cannot be made topological. Keep deterministic
    // traversal while still ordering all acyclic ancestors.
    if (visiting.has(workspace)) {
      return
    }
    visiting.add(workspace)
    for (const dependency of [...(dependencyGraph.get(workspace) ?? [])].sort((left, right) => left.localeCompare(right))) {
      if (selected.has(dependency)) {
        visit(dependency)
      }
    }
    visiting.delete(workspace)
    visited.add(workspace)
    sorted.push(workspace)
  }

  for (const workspace of [...selected].sort((left, right) => left.localeCompare(right))) {
    visit(workspace)
  }
  return sorted
}

function collectBuildClosure(changedWorkspaces: Set<string>, dependencyGraph: Map<string, string[]>) {
  const closure = new Set(changedWorkspaces)
  const visiting = new Set<string>()
  const visit = (workspace: string) => {
    if (visiting.has(workspace)) {
      return
    }
    visiting.add(workspace)
    for (const dependency of dependencyGraph.get(workspace) ?? []) {
      closure.add(dependency)
      visit(dependency)
    }
    visiting.delete(workspace)
  }
  for (const workspace of changedWorkspaces) {
    visit(workspace)
  }
  return closure
}

export function isRootTaskFile(filePath: string) {
  const basename = path.posix.basename(filePath)
  return filePath.startsWith('.github/')
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
}

export function normalizeWorkspaceDirs(workspaces: string[], cwd: string) {
  return [...new Set(workspaces.map(dir => path.relative(cwd, path.resolve(cwd, dir)).split(path.sep).join('/')))]
    .filter(dir => dir && !path.isAbsolute(dir) && dir !== '..' && !dir.startsWith('../'))
    .sort((left, right) => right.length - left.length || left.localeCompare(right))
}

export function resolveWorkspaceDir(filePath: string, workspaces: string[]) {
  return workspaces.find(workspace => filePath === workspace || filePath.startsWith(`${workspace}/`))
}

export function planVerificationTasks(changedFiles: string[], workspaces: string[], cwd: string) {
  const rootTasks = new Set<VerificationTask>(['lint', 'typecheck'])
  const changedWorkspaces = new Set<string>()
  for (const file of changedFiles) {
    const workspace = resolveWorkspaceDir(file, workspaces)
    if (workspace) {
      changedWorkspaces.add(workspace)
    }
    else if (isRootTaskFile(file)) {
      for (const task of verificationOrder) {
        rootTasks.add(task)
      }
    }
  }

  const scriptsByWorkspace = new Map(
    ['.', ...workspaces].map(dir => [dir, getPackageScripts(dir, cwd)]),
  )
  const dependencyGraph = createWorkspaceDependencyGraph(workspaces, cwd)
  const hasScript = (dir: string, task: VerificationTask) => {
    const script = scriptsByWorkspace.get(dir)?.[task]
    return typeof script === 'string' && script.trim().length > 0
  }
  const tasks: { workspace: string, task: VerificationTask }[] = []
  for (const task of verificationOrder) {
    if (rootTasks.has(task) && hasScript('.', task)) {
      tasks.push({ workspace: '.', task })
      continue
    }

    const targets = rootTasks.has(task)
      ? workspaces
      : task === 'build'
        ? [...collectBuildClosure(changedWorkspaces, dependencyGraph)]
        : [...changedWorkspaces]
    const orderedTargets = task === 'build'
      ? sortWorkspaceTasks(targets, dependencyGraph)
      : [...targets].sort((left, right) => left.localeCompare(right))
    for (const workspace of orderedTargets) {
      if (hasScript(workspace, task)) {
        tasks.push({ workspace, task })
      }
    }
  }
  return tasks
}
