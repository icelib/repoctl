/**
 * 工作区工具可接收的筛选选项。
 */
export interface GetWorkspacePackagesOptions {
  /**
   * 是否在结果中排除 workspace 根包。
   * @default true
   */
  ignoreRootPackage?: boolean
  /**
   * 是否过滤掉标记为 `private` 的包。
   * @default true
   */
  ignorePrivatePackage?: boolean
  /**
   * 自定义 glob，覆盖 `pnpm-workspace.yaml` 的 `packages` 配置。
   * @default workspace manifest `packages`
   */
  patterns?: string[]
}

/**
 * 兼容 pnpm workspace manifest 的轻量结构。
 */
export interface WorkspacePackageManifest {
  name?: string
  version?: string
  private?: boolean
  description?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}

/**
 * 轻量的 workspace package 结构，避免导出类型泄漏到 pnpm 内部实现细节。
 */
export interface WorkspacePackage {
  rootDir: string
  rootDirRealPath: string
  modulesDir?: string
  manifest: WorkspacePackageManifest
  writeProjectManifest?: unknown
}

/**
 * 附加 package.json 绝对路径后的 workspace package。
 */
export interface WorkspacePackageWithJsonPath extends WorkspacePackage {
  pkgJsonPath: string
}

/**
 * 适合 CLI 与 JSON 输出消费的 workspace package 摘要。
 */
export interface WorkspacePackageSummary {
  name?: string
  description?: string
  private: boolean
  rootDir: string
  relativeDir: string
  pkgJsonPath: string
}

/**
 * workspace package 摘要集合。
 */
export interface WorkspacePackageSummaryData {
  cwd: string
  workspaceDir: string
  packages: WorkspacePackageSummary[]
}

/**
 * 工作区基础信息与包集合。
 */
export interface WorkspaceData {
  cwd: string
  workspaceDir: string
  packages: WorkspacePackageWithJsonPath[]
}
