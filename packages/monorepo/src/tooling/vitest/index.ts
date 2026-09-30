import type { ViteUserConfig } from 'vitest/config'
import type { DefineVitestConfigOptions, DefineVitestProjectConfigOptions, MonorepoVitestConfigOptions, MonorepoVitestConfigOverrides, MonorepoVitestConfigResult, MonorepoVitestProjectConfigOptions, MonorepoVitestProjectConfigResult } from '../types'
import process from 'node:process'
import { mergeConfig } from 'vitest/config'
import { loadToolingSection } from '../shared'
import { defaultConfigCandidates, defaultProjectRoots, defaultWorkspaceConfigCandidates, findConfig, loadProjectRootsFromWorkspace, resolveProjects } from './discovery'

/**
 * 创建 monorepo 根级 Vitest 配置。
 *
 * 默认值：
 * - `rootDir`: `process.cwd()`
 * - `workspaceFile`: `'pnpm-workspace.yaml'`
 * - `projectRoots`: 自动从 workspace packages 推导，失败时回退到 `['packages', 'apps']`
 * - `includeWorkspaceRootConfig`: `false`
 * - `coverageEnabled`: `true`
 * - `coverageAll`: `false`
 * - `coverageSkipFull`: `true`
 *
 * @param options Vitest 默认配置生成参数
 * @returns 仅包含 `test` 字段的 Vitest 配置片段
 *
 * @example
 * ```ts
 * import { createMonorepoVitestConfig } from 'repoctl/tooling'
 *
 * export default {
 *   ...createMonorepoVitestConfig({
 *     includeWorkspaceRootConfig: false,
 *     coverageExclude: ['dist output glob'],
 *   }),
 * }
 * ```
 */
export function createMonorepoVitestConfig(options: MonorepoVitestConfigOptions = {}): MonorepoVitestConfigResult {
  const rootDir = options.rootDir ?? process.cwd()
  const workspaceFile = options.workspaceFile ?? 'pnpm-workspace.yaml'
  const workspaceProjectRoots = loadProjectRootsFromWorkspace(rootDir, workspaceFile)
  const projectRoots = options.projectRoots ?? (workspaceProjectRoots.length ? workspaceProjectRoots : defaultProjectRoots)
  const configCandidates = options.configCandidates ?? defaultConfigCandidates
  const includeWorkspaceRootConfig = options.includeWorkspaceRootConfig ?? false
  const projects = resolveProjects(rootDir, projectRoots, configCandidates)

  if (includeWorkspaceRootConfig) {
    const rootConfig = findConfig(rootDir, defaultWorkspaceConfigCandidates)
    if (rootConfig) {
      projects.unshift(rootConfig)
    }
  }

  return {
    test: {
      projects: [...new Set(projects)],
      coverage: {
        enabled: options.coverageEnabled ?? true,
        all: options.coverageAll ?? false,
        skipFull: options.coverageSkipFull ?? true,
        ...(options.coverageExclude ? { exclude: options.coverageExclude } : {}),
      } as NonNullable<NonNullable<MonorepoVitestConfigResult['test']>['coverage']>,
      forceRerunTriggers: [
        '**/{vitest,vite}.config.*/**',
      ],
    },
  }
}

function mergeMonorepoVitestConfig(
  base: ViteUserConfig,
  overrides: MonorepoVitestConfigOverrides = {},
): MonorepoVitestConfigResult {
  const merged = mergeConfig(base, overrides) as MonorepoVitestConfigResult
  if (!merged.test) {
    return merged
  }

  const coverageExclude = merged.test.coverage?.exclude
  const projects = merged.test.projects

  if (coverageExclude) {
    merged.test.coverage = {
      ...merged.test.coverage,
      exclude: [...new Set(coverageExclude)],
    }
  }

  if (projects) {
    merged.test.projects = [...new Set(projects)]
  }

  return merged
}

/**
 * 从 `repoctl.config.ts` 读取 `tooling.vitest`，再叠加运行时 `options` 与 `overrides`
 * 生成最终 Vitest 配置。
 *
 * 优先级从低到高：
 * 1. `repoctl.config.ts -> tooling.vitest`
 * 2. `options`
 * 3. `overrides`
 *
 * 推荐把“参与默认值推导”的字段放在 `options`，把“最终局部覆盖”放在 `overrides`。
 *
 * @param input `options` 会先与 `tooling.vitest` 合并；`overrides` 用于最终局部覆盖；`cwd` 用于配置文件解析起点
 * @returns 可直接作为 `defineConfig()` 返回值的 Vitest 配置对象
 *
 * @example
 * ```ts
 * import { defineVitestConfig } from 'repoctl/tooling'
 * import { defineConfig } from 'vitest/config'
 *
 * export default defineConfig(async () => await defineVitestConfig({
 *   options: {
 *     includeWorkspaceRootConfig: false,
 *   },
 *   overrides: {
 *     test: {
 *       coverage: {
 *         exclude: ['dist output glob'],
 *         skipFull: true,
 *       },
 *     },
 *   },
 * }))
 * ```
 */
export async function defineVitestConfig(
  input: DefineVitestConfigOptions = {},
): Promise<MonorepoVitestConfigResult> {
  const cwd = input.cwd ?? process.cwd()
  const options = input.options ?? {}
  const overrides = input.overrides ?? {}
  const toolingOptions = await loadToolingSection('vitest', cwd)
  const toolingOverrides = toolingOptions?.overrides ?? {}
  const { overrides: _ignoredToolingOverrides, ...toolingBaseOptions } = toolingOptions ?? {}

  return mergeMonorepoVitestConfig(
    createMonorepoVitestConfig({
      ...toolingBaseOptions,
      ...options,
    }),
    mergeMonorepoVitestConfig(toolingOverrides, overrides),
  )
}

/**
 * 创建项目级 Vitest 配置。
 *
 * 默认值：
 * - `globals`: `true`
 * - `testTimeout`: `60_000`
 * - `environment`: `'node'`
 *
 * @param options 单个 package/app 的 Vitest 配置项
 * @returns 可直接给项目内 `vitest.config.ts` 使用的 `test` 配置片段
 */
export function createMonorepoVitestProjectConfig(options: MonorepoVitestProjectConfigOptions = {}): MonorepoVitestProjectConfigResult {
  return {
    test: {
      ...(options.alias ? { alias: options.alias } : {}),
      globals: options.globals ?? true,
      testTimeout: options.testTimeout ?? 60_000,
      ...(options.environment ? { environment: options.environment } : {}),
    },
  }
}

/**
 * 从 `repoctl.config.ts` 读取 `tooling.vitestProject`，再叠加运行时 `options`
 * 生成单个 package/app 的项目级 Vitest 配置。
 *
 * 优先级从低到高：
 * 1. `repoctl.config.ts -> tooling.vitestProject`
 * 2. `options`
 *
 * @param input `cwd` 用于配置文件解析起点，`options` 用于追加项目内局部覆盖项
 * @returns 可直接传给 `defineProject()` 或与其他 Vite/Vitest 配置 merge 的项目级配置片段
 */
export async function defineVitestProjectConfig(
  input: DefineVitestProjectConfigOptions = {},
): Promise<MonorepoVitestProjectConfigResult> {
  const cwd = input.cwd ?? process.cwd()
  const toolingOptions = await loadToolingSection('vitestProject', cwd)

  return createMonorepoVitestProjectConfig({
    ...toolingOptions,
    ...input.options,
  })
}
