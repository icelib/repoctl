import { readdirSync, statSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { getWorkspacePackages } from '../../../core/workspace'
import { resolveWorkspaceDirectory, resolveWorkspacePath } from '../../../core/workspace/paths'
import { normalizeWorkspaceDirs } from '../tasks'

export function relativeInside(root: string, target: string) {
  const relative = path.relative(root, target)
  return path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`) ? undefined : relative
}

function findSnapshotWorkspace(cwd: string, snapshotRoot: string) {
  let current = cwd
  while (relativeInside(snapshotRoot, current) !== undefined) {
    if (statSync(path.join(current, 'pnpm-workspace.yaml'), { throwIfNoEntry: false })?.isFile()) {
      return current
    }
    const invalid = readdirSync(current).find(name => /^\.?pnpm-workspaces?\.ya?ml$/.test(name)
      && statSync(path.join(current, name), { throwIfNoEntry: false })?.isFile())
    if (invalid) {
      throw new Error(`The workspace manifest file should be named "pnpm-workspace.yaml". File found: ${path.join(current, invalid)}`)
    }
    if (current === snapshotRoot) {
      break
    }
    current = path.dirname(current)
  }
  return cwd
}

function findNearestWorkspaceRoot(cwd: string, snapshotRoot: string) {
  let current = cwd
  while (relativeInside(snapshotRoot, current) !== undefined) {
    if (statSync(path.join(current, 'pnpm-workspace.yaml'), { throwIfNoEntry: false })?.isFile()) {
      return current
    }
    if (current === snapshotRoot) {
      break
    }
    current = path.dirname(current)
  }
  return undefined
}

/** Discover from the commit, ignoring pnpm environment pointers to the caller. */
export async function getPushContext(snapshotRoot: string, relativeCwd: string, explicit?: string[]) {
  const input = path.join(snapshotRoot, relativeCwd)
  const physicalInput = await resolveWorkspacePath(input)
  if (relativeInside(snapshotRoot, physicalInput) === undefined || !(await stat(physicalInput)).isDirectory()) {
    throw new Error('The verification directory does not exist inside the pushed commit snapshot.')
  }
  const workspaceRoot = await resolveWorkspaceDirectory(findSnapshotWorkspace(physicalInput, snapshotRoot))
  const cwd = explicit === undefined ? workspaceRoot : physicalInput
  for (const directory of [workspaceRoot, cwd]) {
    if (relativeInside(snapshotRoot, directory) === undefined || !(await stat(directory)).isDirectory()) {
      throw new Error('The requested workspace is not inside the pushed commit snapshot.')
    }
  }
  const packages = await getWorkspacePackages(workspaceRoot, { ignorePrivatePackage: false, ignoreRootPackage: false })
  for (const pkg of packages) {
    if (relativeInside(snapshotRoot, pkg.rootDir) === undefined) {
      throw new Error(`Workspace package resolves outside the pushed commit snapshot: ${pkg.rootDir}`)
    }
  }
  const directories = explicit === undefined
    ? packages.map(pkg => pkg.rootDir)
    : await Promise.all(explicit.map(dir => resolveWorkspacePath(path.resolve(cwd, dir))))
  for (const directory of directories) {
    if (relativeInside(snapshotRoot, directory) === undefined) {
      throw new Error(`Explicit workspace resolves outside the pushed commit snapshot: ${directory}`)
    }
  }
  const packageNeedsInstall = (manifest: (typeof packages)[number]['manifest']) => {
    const candidate = manifest as typeof manifest & {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      optionalDependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
      scripts?: Record<string, string>
    }
    const dependencies = [candidate.dependencies, candidate.devDependencies, candidate.optionalDependencies, candidate.peerDependencies]
    return dependencies.some(group => group && Object.keys(group).length > 0)
      || ['preinstall', 'install', 'postinstall', 'prepare'].some(name => candidate.scripts?.[name])
  }
  const discoveredRoots = new Set(packages.map(pkg => pkg.rootDir))
  const externalDirectories = explicit === undefined ? [] : directories.filter(directory => !discoveredRoots.has(directory))
  const externalPackages = await Promise.all(externalDirectories.map(async (directory) => {
    const nestedRoot = findNearestWorkspaceRoot(directory, snapshotRoot)
    const installDirectory = nestedRoot && nestedRoot !== workspaceRoot ? nestedRoot : directory
    try {
      return {
        directory,
        installDirectory,
        manifest: JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8')) as (typeof packages)[number]['manifest'],
      }
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined
      }
      throw error
    }
  }))
  const installDirectories = [...new Set(
    [
      ...packages.filter(pkg => packageNeedsInstall(pkg.manifest)).map(() => workspaceRoot),
      ...externalPackages.flatMap(pkg => pkg && packageNeedsInstall(pkg.manifest) ? [pkg.installDirectory] : []),
    ],
  )]
  const needsInstall = installDirectories.length > 0
  return {
    cwd,
    workspaceRoot,
    workspaces: normalizeWorkspaceDirs(directories, cwd),
    needsInstall,
    installDirectories,
  }
}

export function relativeChangedFiles(files: string[], snapshotRoot: string, cwd: string) {
  const prefix = path.relative(snapshotRoot, cwd).split(path.sep).join('/')
  return files.map(file => path.posix.relative(prefix, file))
    .filter(file => file !== '..' && !file.startsWith('../') && !path.posix.isAbsolute(file))
}
