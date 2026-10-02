import type { WorkspaceLocation, WorkspaceTaskCatalog, WorkspaceTaskOptions, WorkspaceTaskPackage } from './types'
import path from 'pathe'
import { clearWorkspaceCache, getWorkspaceData } from '../workspace'
import { locationCandidates } from './location'

export type * from './types'

function order(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0
}

/** Discover script capabilities; commands remain data and are never executed. */
export async function getWorkspaceTaskCatalog(cwd: string, options: WorkspaceTaskOptions = {}): Promise<WorkspaceTaskCatalog> {
  if (options.script !== undefined && !options.script.trim()) {
    throw new Error('A nonempty script name is required.')
  }
  clearWorkspaceCache()
  const data = await getWorkspaceData(cwd, { ignoreRootPackage: false, ignorePrivatePackage: false })
  const result: WorkspaceTaskCatalog = { schemaVersion: 1, workspaceDir: data.workspaceDir, packages: [], excluded: [] }
  const query = options.query?.toLowerCase()
  for (const pkg of data.packages) {
    const id = path.relative(data.workspaceDir, pkg.rootDir) || '.'
    const scripts = (pkg.manifest as { scripts?: Record<string, unknown> }).scripts ?? {}
    const tasks = Object.entries(scripts)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && !!entry[1].trim())
      .sort(([a], [b]) => order(a, b))
      .map(([name, command]) => ({ name, command, invocation: { executable: 'pnpm' as const, args: ['--dir', pkg.rootDir, 'run', name] } }))
    const summary: WorkspaceTaskPackage = {
      id,
      ...(pkg.manifest.name ? { name: pkg.manifest.name } : {}),
      ...(pkg.manifest.description ? { description: pkg.manifest.description } : {}),
      directory: pkg.rootDir,
      private: pkg.manifest.private === true,
      root: id === '.',
      tasks,
    }
    const reason = options.includePrivate === false && summary.private
      ? 'private_package'
      : options.includeRoot === false && summary.root
        ? 'root_package'
        : query && ![id, summary.name, summary.description, ...tasks.map(task => task.name)].some(value => value?.toLowerCase().includes(query))
          ? 'query_mismatch'
          : options.script && !tasks.some(task => task.name === options.script) ? 'missing_script' : undefined
    if (reason) {
      result.excluded.push({ id, reason })
    }
    else {
      result.packages.push(summary)
    }
  }
  result.packages.sort((a, b) => order(a.id, b.id))
  result.excluded.sort((a, b) => order(a.id, b.id))
  return result
}

/** Prefer exact names/paths, then literal fuzzy search; never silently choose a candidate. */
export async function locateWorkspace(cwd: string, query: string): Promise<WorkspaceLocation> {
  if (!query.trim()) {
    throw new Error('A nonempty workspace query is required.')
  }
  const catalog = await getWorkspaceTaskCatalog(cwd)
  const candidates = await locationCandidates(catalog.packages, query)
  return {
    schemaVersion: 1,
    workspaceDir: catalog.workspaceDir,
    query,
    status: candidates.length === 1 ? 'found' : candidates.length ? 'ambiguous' : 'not_found',
    candidates,
  }
}
