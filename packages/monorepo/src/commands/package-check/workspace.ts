import type { WorkspacePackageWithJsonPath } from '../../types'
import type { PackageCheckOptions, PackageCheckResult, PackedManifest } from './types'
import path from 'node:path'
import { getWorkspaceData } from '../../core/workspace'
import { dependencyReferences } from './dependencies'
import { execute, failureMessage } from './process'

export function packageBuildSelector(workspaceDir: string, directory: string) {
  // pnpm treats backslashes as separators. Character classes preserve literal
  // metacharacters; escaping a final dot avoids the ... dependency operator.
  const literal = path.relative(workspaceDir, directory).split(path.sep).join('/').replace(/[*?[\]{}!()+@]/gu, character => `[${character}]`).replace(/\.$/u, '[.]')
  return `./${literal}`
}

export async function selectPackages(options: PackageCheckOptions, timeout: number) {
  const { packages, workspaceDir } = await getWorkspaceData(options.cwd, { ignorePrivatePackage: false })
  let selected = packages
  if (options.filters?.length) {
    const command = await execute('pnpm', [...options.filters.flatMap(filter => ['--filter', filter]), 'list', '--depth', '-1', '--json'], workspaceDir, timeout)
    if (command.exitCode !== 0) {
      throw new Error(failureMessage(command))
    }
    const listed = JSON.parse(command.stdout) as { path: string }[]
    const paths = new Set(listed.map(item => path.resolve(item.path)))
    selected = packages.filter(pkg => paths.has(path.resolve(pkg.rootDir)))
    if (!selected.length) {
      throw new Error('No workspace packages match the supplied filters.')
    }
  }
  const selectedDirs = new Set(selected.map(pkg => pkg.rootDir))
  const closure = new Map(selected.map(pkg => [pkg.rootDir, pkg]))
  const byName = new Map(packages.filter(pkg => pkg.manifest.name).map(pkg => [pkg.manifest.name!, pkg]))
  function visit(pkg: WorkspacePackageWithJsonPath) {
    if (pkg.manifest.private && !options.includePrivate) {
      return
    }
    for (const reference of dependencyReferences(pkg.manifest as PackedManifest, pkg.rootDir)) {
      const dependency = reference.directory ? packages.find(candidate => candidate.rootDir === reference.directory) : byName.get(reference.name)
      if (dependency && !closure.has(dependency.rootDir)) {
        closure.set(dependency.rootDir, dependency)
        visit(dependency)
      }
    }
  }
  selected.forEach(visit)
  const candidates = [...closure.values()].sort((a, b) => a.rootDir.localeCompare(b.rootDir))
  const buildClosure = new Map<string, WorkspacePackageWithJsonPath>()
  function visitBuild(pkg: WorkspacePackageWithJsonPath) {
    if (buildClosure.has(pkg.rootDir)) {
      return
    }
    buildClosure.set(pkg.rootDir, pkg)
    for (const reference of dependencyReferences(pkg.manifest as PackedManifest, pkg.rootDir, true)) {
      const dependency = reference.directory ? packages.find(candidate => candidate.rootDir === reference.directory) : byName.get(reference.name)
      if (dependency) {
        visitBuild(dependency)
      }
    }
  }
  candidates.filter(pkg => options.includePrivate || !pkg.manifest.private).forEach(visitBuild)
  const results = candidates.map((pkg): PackageCheckResult => ({
    name: pkg.manifest.name ?? path.relative(workspaceDir, pkg.rootDir),
    directory: pkg.rootDir,
    role: selectedDirs.has(pkg.rootDir) ? 'selected' : 'dependency',
    status: pkg.manifest.private && !options.includePrivate ? 'skipped' : 'passed',
    ...(pkg.manifest.private && !options.includePrivate ? { reason: 'private_package' } : {}),
    files: [],
    diagnostics: [],
    commands: [],
  }))
  for (const [index, pkg] of candidates.entries()) {
    for (const reference of dependencyReferences(pkg.manifest as PackedManifest, pkg.rootDir)) {
      const local = reference.directory ? packages.find(candidate => candidate.rootDir === reference.directory) : byName.get(reference.name)
      if (!local && (reference.protocol === 'workspace' || reference.protocol === 'link')) {
        results[index]!.diagnostics.push({ source: 'repoctl', code: 'UNRESOLVED_WORKSPACE_DEPENDENCY', severity: 'error', file: `package.json:${reference.field}.${reference.alias}`, message: `Cannot resolve local dependency ${reference.alias} (${reference.range}) to a workspace package.` })
      }
    }
  }
  return { workspaceDir, candidates, results, buildDirectories: [...buildClosure.keys()].sort() }
}
