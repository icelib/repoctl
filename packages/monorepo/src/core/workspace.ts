import type { GetWorkspacePackagesOptions, WorkspaceData, WorkspacePackageSummary, WorkspacePackageSummaryData, WorkspacePackageWithJsonPath } from '../types'
import { findWorkspaceDir } from '@pnpm/find-workspace-dir'
import { readWorkspaceManifest } from '@pnpm/workspace.read-manifest'
import path from 'pathe'
import { findWorkspacePackages } from './workspace/discovery'

export type { GetWorkspacePackagesOptions } from '../types'

type WorkspaceManifest = Awaited<ReturnType<typeof readWorkspaceManifest>>
type WorkspacePackage = Awaited<ReturnType<typeof findWorkspacePackages>>[number]

const workspaceDirCache = new Map<string, Promise<string | undefined>>()
const workspaceManifestCache = new Map<string, Promise<WorkspaceManifest>>()
const workspacePackagesCache = new Map<string, Promise<WorkspacePackage[]>>()

function normalizeDir(dir: string) {
  return path.resolve(dir)
}

function getPatternsCacheKey(patterns: string[] | undefined) {
  return patterns === undefined ? '<manifest>' : JSON.stringify(patterns)
}

function comparePackagePath(left: WorkspacePackageSummary, right: WorkspacePackageSummary) {
  return left.relativeDir.localeCompare(right.relativeDir)
}

function getPackageRootDir(project: WorkspacePackage) {
  return normalizeDir(project.rootDirRealPath || project.rootDir)
}

async function findWorkspaceDirCached(cwd: string) {
  const key = normalizeDir(cwd)
  if (!workspaceDirCache.has(key)) {
    workspaceDirCache.set(key, findWorkspaceDir(key))
  }
  return workspaceDirCache.get(key)!
}

async function readWorkspaceManifestCached(workspaceDir: string) {
  const key = normalizeDir(workspaceDir)
  if (!workspaceManifestCache.has(key)) {
    workspaceManifestCache.set(key, readWorkspaceManifest(key))
  }
  return workspaceManifestCache.get(key)!
}

async function findWorkspacePackagesCached(workspaceDir: string, patterns: string[] | undefined) {
  const normalizedWorkspaceDir = normalizeDir(workspaceDir)
  const key = `${normalizedWorkspaceDir}:${getPatternsCacheKey(patterns)}`
  if (!workspacePackagesCache.has(key)) {
    workspacePackagesCache.set(
      key,
      findWorkspacePackages(
        normalizedWorkspaceDir,
        patterns ? { patterns } : {},
      ),
    )
  }
  return workspacePackagesCache.get(key)!
}

/**
 * 清空当前进程内的 workspace 发现缓存。
 *
 * 普通 CLI 命令执行后进程会退出；长期运行的集成测试或程序化调用在修改
 * `pnpm-workspace.yaml` / package 目录后，可以调用它让后续扫描重新读磁盘。
 */
export function clearWorkspaceCache() {
  workspaceDirCache.clear()
  workspaceManifestCache.clear()
  workspacePackagesCache.clear()
}

/**
 * 读取 pnpm workspace 下的所有包，并根据选项做过滤。
 *
 * 默认值：
 * - `ignoreRootPackage`: `true`
 * - `ignorePrivatePackage`: `true`
 *
 * @param workspaceDir workspace 根目录
 * @param options 过滤选项
 * @returns 带有 `pkgJsonPath` 字段的 workspace package 列表
 */
export async function getWorkspacePackages(
  workspaceDir: string,
  options?: GetWorkspacePackagesOptions,
): Promise<WorkspacePackageWithJsonPath[]> {
  const normalizedWorkspaceDir = normalizeDir(workspaceDir)
  const ignoreRootPackage = options?.ignoreRootPackage ?? true
  const ignorePrivatePackage = options?.ignorePrivatePackage ?? true

  const manifest = options?.patterns === undefined
    ? await readWorkspaceManifestCached(normalizedWorkspaceDir)
    : undefined
  const workspacePatterns = options?.patterns ?? manifest?.packages
  const packages = await findWorkspacePackagesCached(normalizedWorkspaceDir, workspacePatterns)
  let pkgs: WorkspacePackageWithJsonPath[] = packages.filter((x) => {
    if (ignorePrivatePackage && x.manifest.private) {
      return false
    }
    return true
  }).map((project) => {
    const rootDir = getPackageRootDir(project)
    const pkgJsonPath = path.resolve(rootDir, 'package.json')
    return {
      ...project,
      rootDir,
      pkgJsonPath,
    }
  })

  if (ignoreRootPackage) {
    pkgs = pkgs.filter((x) => {
      return x.rootDir !== normalizedWorkspaceDir
    })
  }
  return pkgs
}

/**
 * 一次性返回 `cwd`、真实 `workspaceDir` 与过滤后的包列表。
 *
 * @param cwd 当前工作目录
 * @param options 传给 `getWorkspacePackages()` 的过滤选项
 */
export async function getWorkspaceData(cwd: string, options?: GetWorkspacePackagesOptions): Promise<WorkspaceData> {
  const normalizedCwd = normalizeDir(cwd)
  const workspaceDir = (await findWorkspaceDirCached(normalizedCwd)) ?? normalizedCwd
  const packages = await getWorkspacePackages(workspaceDir, options)
  return {
    cwd: normalizedCwd,
    workspaceDir,
    packages,
  }
}

/**
 * 返回适合展示和程序化消费的 workspace package 摘要。
 */
export async function getWorkspacePackageSummaries(
  cwd: string,
  options?: GetWorkspacePackagesOptions,
): Promise<WorkspacePackageSummaryData> {
  const { packages, workspaceDir } = await getWorkspaceData(cwd, options)
  const summaries = packages
    .map<WorkspacePackageSummary>(pkg => ({
      ...(pkg.manifest.name ? { name: pkg.manifest.name } : {}),
      ...(pkg.manifest.description ? { description: pkg.manifest.description } : {}),
      private: pkg.manifest.private === true,
      rootDir: pkg.rootDir,
      relativeDir: path.relative(workspaceDir, pkg.rootDir) || '.',
      pkgJsonPath: pkg.pkgJsonPath,
    }))
    .sort(comparePackagePath)

  return {
    cwd: normalizeDir(cwd),
    workspaceDir,
    packages: summaries,
  }
}
