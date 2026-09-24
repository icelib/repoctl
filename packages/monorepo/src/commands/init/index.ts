import type { InitToolingTarget } from './tooling/types'
import type { PackageJson } from '@/types'
import { getWorkspacePackageManager } from '@icebreakers/monorepo-templates'
import path from 'pathe'
import YAML from 'yaml'
import fs from '@/utils/fs'
import { createContext } from '../../core/context'
import setChangeset from './setChangeset'
import setIssueTemplateConfig from './setIssueTemplateConfig'
import setPkgJson from './setPkgJson'
import setReadme from './setReadme'
import { initTooling, initToolingTargets, normalizeInitToolingTargets } from './tooling'

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

const defaultWorkspacePackages = ['apps/*', 'packages/*', 'examples/*']

function mergeUniqueStrings(current: unknown, additions: string[]) {
  const values = Array.isArray(current)
    ? current.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : []
  const seen = new Set(values)
  for (const addition of additions) {
    if (!seen.has(addition)) {
      seen.add(addition)
      values.push(addition)
    }
  }
  return values
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

async function ensureWorkspaceManifest(cwd: string) {
  const workspacePath = path.resolve(cwd, 'pnpm-workspace.yaml')
  const existing = await fs.pathExists(workspacePath)
  const manifest = existing
    ? YAML.parse(await fs.readFile(workspacePath, 'utf8')) ?? {}
    : {}
  const nextManifest = {
    ...(typeof manifest === 'object' && manifest !== null ? manifest : {}),
    packages: mergeUniqueStrings(
      typeof manifest === 'object' && manifest !== null ? (manifest as { packages?: unknown }).packages : undefined,
      defaultWorkspacePackages,
    ),
  }
  const nextContent = YAML.stringify(nextManifest, { singleQuote: true })
  const previous = existing ? await fs.readFile(workspacePath, 'utf8') : ''
  if (!existing || previous !== nextContent) {
    await fs.writeFile(workspacePath, nextContent, 'utf8')
  }
}

async function runInitMetadata(cwd: string, options: InitCommandRuntimeOptions = {}) {
  await ensureRootPackageJson(cwd)
  await ensureWorkspaceManifest(cwd)
  const ctx = await createContext(cwd)
  const initConfig = ctx.config.commands?.init ?? {}
  const overwrite = options.overwrite ?? options.force ?? initConfig.force ?? false

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
