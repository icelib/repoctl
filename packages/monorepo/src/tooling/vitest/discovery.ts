import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'

export const defaultProjectRoots = ['packages', 'apps']
export const defaultConfigCandidates = [
  'vitest.config.ts',
  'vitest.config.mts',
  'vitest.config.js',
  'vitest.config.cjs',
  'vitest.workspace.ts',
  'vitest.workspace.mts',
]
export const defaultWorkspaceConfigCandidates = [
  'vitest.config.ts',
  'vitest.config.mts',
  'vitest.config.cts',
  'vitest.config.js',
  'vitest.config.cjs',
  'vitest.config.mjs',
]
const windowsPathSeparatorPattern = /\\/g
const relativeCurrentDirPattern = /^\.\//
const globTokenPattern = /[*?[{]/
const trailingSlashPattern = /\/+$/
export function resolveProjects(rootDir: string, projectRoots: string[], configCandidates: string[]) {
  const projects: string[] = []

  for (const folder of projectRoots) {
    const rootPath = path.resolve(rootDir, folder)
    if (!fs.existsSync(rootPath)) {
      continue
    }

    const entries = fs.readdirSync(rootPath, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue
      }

      const projectDir = path.join(rootPath, entry.name)
      const configPath = configCandidates
        .map(candidate => path.join(projectDir, candidate))
        .find(fs.existsSync)

      if (configPath) {
        projects.push(path.relative(rootDir, configPath))
      }
    }
  }

  return projects
}

function extractBaseDirFromGlob(pattern: string): string | null {
  if (!pattern) {
    return null
  }

  const normalized = pattern
    .replace(windowsPathSeparatorPattern, '/')
    .replace(relativeCurrentDirPattern, '')
  const globIndex = normalized.search(globTokenPattern)
  const base = globIndex === -1
    ? normalized
    : normalized.slice(0, globIndex)

  const cleaned = base.replace(trailingSlashPattern, '')
  return cleaned || null
}

export function loadProjectRootsFromWorkspace(rootDir: string, workspaceFile: string) {
  const workspacePath = path.resolve(rootDir, workspaceFile)
  if (!fs.existsSync(workspacePath)) {
    return []
  }

  try {
    const workspaceContent = fs.readFileSync(workspacePath, 'utf8')
    const workspace = YAML.parse(workspaceContent) ?? {}
    const packages: unknown[] = Array.isArray(workspace.packages) ? workspace.packages : []

    const roots = packages
      .map(entry => typeof entry === 'string' ? entry.trim() : '')
      .filter(entry => entry && !entry.startsWith('!'))
      .map(extractBaseDirFromGlob)
      .filter((entry): entry is string => Boolean(entry))

    return roots.length ? [...new Set(roots)] : []
  }
  catch {
    return []
  }
}

export function findConfig(basePath: string, configCandidates: string[]) {
  for (const filename of configCandidates) {
    const candidate = path.join(basePath, filename)
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }
  return null
}
