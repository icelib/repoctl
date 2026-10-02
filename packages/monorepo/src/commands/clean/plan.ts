import type { CleanCommandConfig } from '../../types'
import type { CleanWorkspace } from './discovery'
import { readFile } from 'node:fs/promises'
import path from 'pathe'
import { localize } from '../../i18n'
import { assertSafePath, isWithin, validateCleanTargets } from './safety'

interface DependencyChange {
  field: string
  before: string | null
  after: string | null
}

export interface CleanPlan {
  workspaceDir: string
  deletions: string[]
  metadata: {
    path: string
    changes: DependencyChange[]
  } | null
}

export async function createCleanPlan(workspace: CleanWorkspace, selected: string[], config: CleanCommandConfig) {
  await validateCleanTargets(workspace, selected)
  const targets = [...new Set(selected)].sort()
  const directories = targets.filter(target => !targets.some(parent => parent !== target && isWithin(parent, target)))
  const packageJsonPath = path.join(workspace.workspaceDir, 'package.json')
  await assertSafePath(workspace.workspaceDir, packageJsonPath, 'file')
  const original = await readFile(packageJsonPath, 'utf8')
  const pkg = JSON.parse(original)
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)
    || (pkg.devDependencies !== undefined && (!pkg.devDependencies || typeof pkg.devDependencies !== 'object' || Array.isArray(pkg.devDependencies)))) {
    throw new Error(localize('Invalid root package.json devDependencies.', '根 package.json 的 devDependencies 无效。'))
  }
  const deps = { ...pkg.devDependencies }
  const version = config.pinnedVersion ?? deps.repoctl ?? 'latest'
  if (typeof version !== 'string' || version.trim().length === 0) {
    throw new Error(localize('The repoctl dependency version must be a nonempty string.', 'repoctl 依赖版本必须是非空字符串。'))
  }
  const changes: DependencyChange[] = []
  const legacy = deps['@icebreakers/monorepo']
  if (legacy !== undefined) {
    changes.push({ field: 'devDependencies.@icebreakers/monorepo', before: legacy, after: null })
    delete deps['@icebreakers/monorepo']
  }
  if (deps.repoctl !== version) {
    changes.push({ field: 'devDependencies.repoctl', before: deps.repoctl ?? null, after: version })
    deps.repoctl = version
  }
  const plan: CleanPlan = {
    workspaceDir: workspace.workspaceDir,
    deletions: directories.map(dir => path.relative(workspace.workspaceDir, dir)),
    metadata: changes.length ? { path: 'package.json', changes } : null,
  }
  return {
    plan,
    selected,
    original,
    packageJsonPath,
    packageJsonContent: changes.length ? `${JSON.stringify({ ...pkg, devDependencies: deps }, undefined, 2)}\n` : original,
  }
}
