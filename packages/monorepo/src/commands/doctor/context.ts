import type { DoctorContext, DoctorPackageJson } from './types'
import { findWorkspaceDir } from '@pnpm/find-workspace-dir'
import { findWorkspacePackages } from '@pnpm/workspace.find-packages'
import klaw from 'klaw'
import path from 'pathe'
import YAML from 'yaml'
import { parseWorkspaceManifest } from '../../core/workspace/manifest'
import { isWorkspacePackageCovered, isWorkspacePackageExcluded } from '../../core/workspace/patterns'
import fs from '../../utils/fs'

async function isRepoctlSourceWorkspace(workspaceDir: string) {
  const [hasMonorepoSource, hasRepoctlSource] = await Promise.all([
    fs.pathExists(`${workspaceDir}/packages/monorepo/src/tooling/index.ts`),
    fs.pathExists(`${workspaceDir}/packages/repoctl/src/tooling-entry.ts`),
  ])
  return hasMonorepoSource && hasRepoctlSource
}

function formatDiscoveryError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function parseDoctorPackageJson(value: unknown): DoctorPackageJson {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Root package.json must contain a JSON object.')
  }
  return value as DoctorPackageJson
}

async function recoverWorkspacePackageDirs(workspaceDir: string, patterns: string[]) {
  const dirs = new Set<string>()
  const errors: string[] = []
  for await (const entry of klaw(workspaceDir, {
    filter(filePath) {
      const relativePath = path.relative(workspaceDir, filePath)
      return !relativePath.split(path.sep).includes('node_modules')
        && !relativePath.split(path.sep).includes('bower_components')
    },
  })) {
    if (!entry.stats.isFile() || !['package.json', 'package.yaml', 'package.json5'].includes(path.basename(entry.path))) {
      continue
    }
    const relativeDir = path.relative(workspaceDir, path.dirname(entry.path)).split(path.sep).join('/')
    if (relativeDir && !isWorkspacePackageCovered(relativeDir, patterns)) {
      continue
    }
    try {
      const content = await fs.readFile(entry.path, 'utf8')
      const manifest = path.basename(entry.path) === 'package.json'
        ? JSON.parse(content) as unknown
        : YAML.parse(content) as unknown
      if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
        throw new TypeError('package manifest must contain an object')
      }
      if (relativeDir) {
        dirs.add(relativeDir)
      }
    }
    catch (error) {
      const relativePath = path.relative(workspaceDir, entry.path).split(path.sep).join('/')
      errors.push(`${relativePath}: ${formatDiscoveryError(error)}`)
    }
  }
  return {
    dirs: [...dirs].sort((left, right) => left.localeCompare(right)),
    errors,
  }
}

async function findWorkspacePackageDirs(workspaceDir: string, patterns: string[], included: string[]) {
  const result = new Set(included)
  // Discover candidate package manifests with the same pnpm implementation
  // used for the configured workspace patterns. Passing a broad pattern lets
  // doctor inspect packages in arbitrary directories (for example
  // `modules/**`) before applying the configured exclusions below.
  let discovered
  try {
    discovered = await findWorkspacePackages(workspaceDir, { patterns: ['**'] })
  }
  catch (error) {
    // A malformed package.json anywhere in the tree must not make `repo doctor`
    // itself crash. Recover each manifest independently so valid packages in
    // the same pattern remain visible in package counts and coverage checks.
    const recovered = await recoverWorkspacePackageDirs(workspaceDir, ['**'])
    for (const dir of recovered.dirs) {
      if (!isWorkspacePackageExcluded(dir, patterns)) {
        result.add(dir)
      }
    }
    return {
      dirs: [...result].sort((left, right) => left.localeCompare(right)),
      error: [formatDiscoveryError(error), ...recovered.errors].join('; '),
    }
  }
  for (const pkg of discovered) {
    const relativeDir = path.relative(workspaceDir, pkg.rootDir).split(path.sep).join('/')
    if (relativeDir && !isWorkspacePackageExcluded(relativeDir, patterns)) {
      result.add(relativeDir)
    }
  }
  return { dirs: [...result].sort((left, right) => left.localeCompare(right)) }
}

export async function collectDoctorContext(cwd: string): Promise<DoctorContext> {
  const workspaceDir = await findWorkspaceDir(cwd) ?? cwd
  const packageJsonPath = `${workspaceDir}/package.json`
  const workspaceManifestPath = `${workspaceDir}/pnpm-workspace.yaml`
  const [
    hasPackageJson,
    hasWorkspaceManifest,
    hasRepoctlConfig,
    hasLegacyMonorepoConfig,
    hasHuskyPreCommit,
    hasLintStagedConfig,
  ] = await Promise.all([
    fs.pathExists(packageJsonPath),
    fs.pathExists(workspaceManifestPath),
    fs.pathExists(`${workspaceDir}/repoctl.config.ts`),
    fs.pathExists(`${workspaceDir}/monorepo.config.ts`),
    fs.pathExists(`${workspaceDir}/.husky/pre-commit`),
    fs.pathExists(`${workspaceDir}/lint-staged.config.js`),
  ])
  let packageJson: DoctorPackageJson = {}
  let packageJsonError: string | undefined
  if (hasPackageJson) {
    try {
      packageJson = parseDoctorPackageJson(await fs.readJson<unknown>(packageJsonPath))
    }
    catch (error) {
      packageJsonError = formatDiscoveryError(error)
    }
  }
  let workspacePatterns: string[] = []
  let workspaceManifestError: string | undefined
  if (hasWorkspaceManifest) {
    try {
      workspacePatterns = parseWorkspaceManifest(await fs.readFile(workspaceManifestPath, 'utf8')).patterns ?? ['**']
    }
    catch (error) {
      workspaceManifestError = error instanceof Error ? error.message : String(error)
    }
  }
  let packages: Awaited<ReturnType<typeof findWorkspacePackages>> = []
  let workspacePackageDiscoveryError: string | undefined
  if (hasWorkspaceManifest && !workspaceManifestError) {
    try {
      packages = (await findWorkspacePackages(workspaceDir, { patterns: workspacePatterns })).filter(pkg => path.resolve(pkg.rootDir) !== path.resolve(workspaceDir))
    }
    catch (error) {
      workspacePackageDiscoveryError = formatDiscoveryError(error)
      const recovered = await recoverWorkspacePackageDirs(workspaceDir, workspacePatterns)
      packages = recovered.dirs.map(relativeDir => ({ rootDir: path.join(workspaceDir, relativeDir) } as Awaited<ReturnType<typeof findWorkspacePackages>>[number]))
      workspacePackageDiscoveryError = [workspacePackageDiscoveryError, ...recovered.errors].join('; ')
    }
  }
  const included = packages.map(pkg => path.relative(workspaceDir, pkg.rootDir).split(path.sep).join('/'))
  let workspacePackageDirs: string[] = []
  if (hasWorkspaceManifest && !workspaceManifestError) {
    const discovered = await findWorkspacePackageDirs(workspaceDir, workspacePatterns, included)
    workspacePackageDirs = discovered.dirs
    workspacePackageDiscoveryError ??= discovered.error
  }

  return {
    cwd,
    workspaceDir,
    packageJson,
    ...(packageJsonError ? { packageJsonError } : {}),
    packageCount: packages.length,
    workspacePatterns,
    workspacePackageDirs,
    ...(workspaceManifestError ? { workspaceManifestError } : {}),
    ...(workspacePackageDiscoveryError ? { workspacePackageDiscoveryError } : {}),
    hasPackageJson,
    hasWorkspaceManifest,
    hasRepoctlConfig,
    hasLegacyMonorepoConfig,
    hasHuskyPreCommit,
    hasLintStagedConfig,
    isSourceWorkspace: await isRepoctlSourceWorkspace(workspaceDir),
  }
}
