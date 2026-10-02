import type { InitToolingTarget } from './tooling/types'
import type { PackageJson } from '@/types'
import { getWorkspacePackageManager } from '@icebreakers/monorepo-templates'
import path from 'pathe'
import fs from '@/utils/fs'
import { createContext } from '../../core/context'
import { clearWorkspaceCache } from '../../core/workspace'
import setChangeset from './setChangeset'
import setIssueTemplateConfig from './setIssueTemplateConfig'
import setPkgJson from './setPkgJson'
import setReadme from './setReadme'
import { initTooling, initToolingTargets, normalizeInitToolingTargets } from './tooling'
import { prepareInitWorkspaceManifest } from './workspace'

export { initTooling, initToolingTargets } from './tooling'
export { normalizeInitToolingTargets } from './tooling'
export type { InitToolingExecutionOptions, InitToolingResult, InitToolingTarget } from './tooling/types'

export type InitPreset = 'minimal' | 'standard'

export interface InitCommandRuntimeOptions {
  tooling?: readonly InitToolingTarget[]
  all?: boolean
  force?: boolean
  overwrite?: boolean
  yes?: boolean
  preset?: InitPreset
}

const presetToolingMap: Record<InitPreset, InitToolingTarget[]> = {
  minimal: ['tsconfig'],
  standard: [...initToolingTargets],
}

async function ensureRootPackageJson(cwd: string) {
  const pkgJsonPath = path.resolve(cwd, 'package.json')
  if (!await fs.pathExists(pkgJsonPath)) {
    const pkgJson: PackageJson = {
      name: path.basename(cwd),
      type: 'module',
      version: '0.0.0',
      private: true,
      packageManager: await getWorkspacePackageManager(),
      engines: {
        node: '>=22.13.0',
      },
      scripts: {},
      devDependencies: {},
    }
    await fs.writeFile(pkgJsonPath, `${JSON.stringify(pkgJson, undefined, 2)}\n`, 'utf8')
  }
}

async function runInitMetadata(cwd: string, options: InitCommandRuntimeOptions = {}) {
  const workspaceManifest = await prepareInitWorkspaceManifest(cwd)
  await ensureRootPackageJson(cwd)
  if (workspaceManifest.content !== undefined) {
    await fs.writeFile(workspaceManifest.path, workspaceManifest.content, 'utf8')
  }
  // The workspace may have been queried before init created its root files.
  // Rebuild discovery before creating a context so it sees the new manifest.
  clearWorkspaceCache()
  const ctx = await createContext(cwd)
  const initConfig = ctx.config.commands?.init ?? {}
  const overwrite = options.overwrite ?? options.force ?? initConfig.force ?? false

  try {
    if (!initConfig.skipChangeset) {
      await setChangeset(ctx)
    }
    if (!initConfig.skipPkgJson) {
      await setPkgJson(ctx)
    }
    if (!initConfig.skipReadme) {
      await setReadme(ctx, { force: overwrite })
    }
    if (!initConfig.skipIssueTemplateConfig) {
      await setIssueTemplateConfig(ctx)
    }
  }
  finally {
    // Metadata writers can update package manifests. Always invalidate after
    // they run, including partial failures, so later calls cannot reuse stale
    // package contents.
    clearWorkspaceCache()
  }

  return { ctx, initConfig }
}

export async function initMetadata(cwd: string) {
  await runInitMetadata(cwd)
}

/**
 * 初始化命令入口，根据配置逐步生成基础文件。
 */
export async function init(cwd: string, options: InitCommandRuntimeOptions = {}) {
  const { initConfig } = await runInitMetadata(cwd, options)

  const preset = options.preset ?? initConfig.preset
  const presetTargets = preset ? presetToolingMap[preset] : undefined
  const configuredTargets = initConfig.tooling ?? []
  const runtimeTargets = options.tooling?.length
    ? [...options.tooling]
    : presetTargets ?? configuredTargets
  const targets = options.all
    ? [...initToolingTargets]
    : normalizeInitToolingTargets(runtimeTargets)

  await initTooling(cwd, {
    targets,
    force: options.force ?? options.overwrite ?? initConfig.force ?? false,
    ...(options.all !== undefined ? { all: options.all } : {}),
  })
}
