import type { DoctorContext, DoctorPackageJson } from './types'
import { readdir, realpath } from 'node:fs/promises'
import { findWorkspaceDir } from '@pnpm/find-workspace-dir'
import YAML from 'yaml'
import fs from '../../utils/fs'
import { getWorkspacePatterns } from './helpers'
import { discoverDoctorManifests } from './manifest/discovery'
import { record } from './manifest/types'

function rootPackageJson(data: Record<string, unknown> = {}): DoctorPackageJson {
  const stringMap = (value: unknown) => Object.fromEntries(Object.entries(record(value) ?? {}).filter((item): item is [string, string] => typeof item[1] === 'string'))
  return {
    ...data,
    packageManager: typeof data['packageManager'] === 'string' ? data['packageManager'] : undefined,
    engines: typeof record(data['engines'])?.['node'] === 'string' ? { node: record(data['engines'])!['node'] as string } : {},
    dependencies: stringMap(data['dependencies']),
    devDependencies: stringMap(data['devDependencies']),
    scripts: stringMap(data['scripts']),
  }
}

async function isRepoctlSourceWorkspace(workspaceDir: string) {
  const [hasMonorepoSource, hasRepoctlSource] = await Promise.all([
    fs.pathExists(`${workspaceDir}/packages/monorepo/src/tooling/index.ts`),
    fs.pathExists(`${workspaceDir}/packages/repoctl/src/tooling-entry.ts`),
  ])
  return hasMonorepoSource && hasRepoctlSource
}

async function findWorkspacePackageDirs(workspaceDir: string) {
  const result: string[] = []
  for (const baseDir of ['apps', 'packages', 'examples']) {
    const absBaseDir = `${workspaceDir}/${baseDir}`
    if (!await fs.pathExists(absBaseDir)) {
      continue
    }
    const entries = await readdir(absBaseDir)
    await Promise.all(entries.map(async (entry) => {
      if (await fs.pathExists(`${absBaseDir}/${entry}/package.json`)) {
        result.push(`${baseDir}/${entry}`)
      }
    }))
  }
  return result.sort((left, right) => left.localeCompare(right))
}

export async function collectDoctorContext(cwd: string): Promise<DoctorContext> {
  const workspaceDir = await realpath(await findWorkspaceDir(cwd) ?? cwd)
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
  let workspacePatterns: string[] = []
  let workspaceManifestError = false
  if (hasWorkspaceManifest) {
    try {
      const workspace = record(YAML.parse(await fs.readFile(workspaceManifestPath, 'utf8')))
      const patterns = workspace?.['packages']
      if (!workspace || (patterns !== undefined && (!Array.isArray(patterns) || patterns.some(value => typeof value !== 'string' || !value)))) {
        throw new Error('Invalid workspace patterns')
      }
      workspacePatterns = patterns === undefined ? ['.', '**'] : getWorkspacePatterns(workspace)
    }
    catch {
      workspaceManifestError = true
    }
  }
  const manifests = await discoverDoctorManifests(workspaceDir, workspacePatterns)
  const packageJson = rootPackageJson(manifests.find(entry => entry.directory === workspaceDir)?.data)
  const packageCount = manifests.filter(entry => entry.directory !== workspaceDir).length

  return {
    cwd,
    workspaceDir,
    packageJson,
    packageCount,
    manifests,
    workspaceManifestError,
    workspacePatterns,
    workspacePackageDirs: hasWorkspaceManifest ? await findWorkspacePackageDirs(workspaceDir) : [],
    hasPackageJson,
    hasWorkspaceManifest,
    hasRepoctlConfig,
    hasLegacyMonorepoConfig,
    hasHuskyPreCommit,
    hasLintStagedConfig,
    isSourceWorkspace: await isRepoctlSourceWorkspace(workspaceDir),
  }
}
