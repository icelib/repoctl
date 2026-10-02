import type { DoctorCheck, DoctorContext } from './types'
import { localize } from '../../i18n'
import { createCheck, isWorkspacePatternCovered } from './helpers'

export function collectWorkspaceChecks(context: DoctorContext) {
  const {
    hasPackageJson,
    hasWorkspaceManifest,
    hasRepoctlConfig,
    hasLegacyMonorepoConfig,
    hasHuskyPreCommit,
    hasLintStagedConfig,
    packageCount,
    workspaceDir,
    workspacePackageDirs,
    workspacePatterns,
  } = context
  const checks: DoctorCheck[] = [
    hasPackageJson
      ? createCheck({
          id: 'package-json',
          title: 'package.json',
          status: 'pass',
          detail: localize(`Found root package.json: ${workspaceDir}/package.json`, `已找到根 package.json：${workspaceDir}/package.json`),
        })
      : createCheck({
          id: 'package-json',
          title: 'package.json',
          status: 'fail',
          detail: localize('The current directory does not contain a root package.json.', '当前目录缺少根 package.json。'),
          fix: localize('Run the command from the monorepo root or initialize the workspace first.', '请在 monorepo 根目录执行命令，或先完成工作区初始化。'),
        }),
    hasWorkspaceManifest
      ? createCheck({
          id: 'workspace-manifest',
          title: 'pnpm workspace',
          status: 'pass',
          detail: localize(`Found a pnpm workspace with ${packageCount} package(s).`, `已找到 pnpm workspace，当前识别到 ${packageCount} 个 workspace 包。`),
        })
      : createCheck({
          id: 'workspace-manifest',
          title: 'pnpm workspace',
          status: 'fail',
          detail: localize('pnpm-workspace.yaml is missing; this directory is not a complete pnpm monorepo root.', '缺少 pnpm-workspace.yaml，当前目录不是完整的 pnpm monorepo 根目录。'),
          fix: localize('Run repo init --yes or switch to the workspace root.', '运行 repo init --yes，或切换到 workspace 根目录。'),
        }),
  ]

  if (hasLegacyMonorepoConfig) {
    checks.push(createCheck({
      id: 'config-file',
      title: localize('Configuration file', '配置文件'),
      status: 'fail',
      detail: localize('Found deprecated monorepo.config.ts; repoctl no longer loads it.', '检测到已废弃的 monorepo.config.ts；repoctl 不再加载该文件。'),
      fix: localize('Rename it to repoctl.config.ts and keep only the repoctl config.', '将其重命名为 repoctl.config.ts，并只保留 repoctl 配置。'),
    }))
  }
  else if (hasRepoctlConfig) {
    checks.push(createCheck({
      id: 'config-file',
      title: localize('Configuration file', '配置文件'),
      status: 'pass',
      detail: localize('Found repoctl.config.ts.', '已检测到 repoctl.config.ts。'),
    }))
  }
  else {
    checks.push(createCheck({
      id: 'config-file',
      title: localize('Configuration file', '配置文件'),
      status: 'warn',
      detail: localize('No custom configuration file was found; the CLI will use defaults.', '未找到自定义配置文件；CLI 将使用默认配置。'),
      fix: localize('Run repo upgrade --yes or add repoctl.config.ts manually.', '运行 repo upgrade --yes，或手动添加 repoctl.config.ts。'),
    }))
  }

  if (hasHuskyPreCommit && hasLintStagedConfig) {
    checks.push(createCheck({
      id: 'commit-hooks',
      title: localize('Commit hooks', '提交钩子'),
      status: 'pass',
      detail: localize('Found .husky/pre-commit and lint-staged.config.js.', '已检测到 .husky/pre-commit 和 lint-staged.config.js。'),
    }))
  }
  else {
    checks.push(createCheck({
      id: 'commit-hooks',
      title: localize('Commit hooks', '提交钩子'),
      status: 'warn',
      detail: localize('Husky and lint-staged are not both configured.', 'Husky 和 lint-staged 尚未同时配置。'),
      fix: localize('Run repo upgrade --yes to synchronize the default hooks.', '运行 repo upgrade --yes 同步默认钩子。'),
    }))
  }

  const existingBases = ['apps', 'packages', 'examples'].filter(base => workspacePackageDirs.some(dir => dir.startsWith(`${base}/`)))
  const missingPatterns = existingBases.map(base => `${base}/*`).filter(pattern => !workspacePatterns.includes(pattern))
  if (hasWorkspaceManifest) {
    checks.push(createCheck(missingPatterns.length === 0
      ? {
          id: 'workspace-patterns',
          title: localize('Workspace patterns', 'Workspace 匹配规则'),
          status: 'pass',
          detail: localize('pnpm-workspace.yaml includes the existing conventional workspace directories.', 'pnpm-workspace.yaml 已包含现有的常规 workspace 目录。'),
        }
      : {
          id: 'workspace-patterns',
          title: localize('Workspace patterns', 'Workspace 匹配规则'),
          status: 'warn',
          detail: localize(`pnpm-workspace.yaml is missing: ${missingPatterns.join(', ')}.`, `pnpm-workspace.yaml 缺少：${missingPatterns.join(', ')}。`),
          fix: localize('Run repo init --yes to append missing workspace patterns.', '运行 repo init --yes 追加缺失的 workspace 匹配规则。'),
        }))

    const uncovered = workspacePackageDirs.filter(dir => !isWorkspacePatternCovered(dir, workspacePatterns))
    checks.push(createCheck(uncovered.length === 0
      ? {
          id: 'workspace-package-coverage',
          title: localize('Workspace package coverage', 'Workspace 包覆盖'),
          status: 'pass',
          detail: localize('Every package.json in a conventional workspace directory is covered.', '常规 workspace 目录中的 package.json 均已覆盖。'),
        }
      : {
          id: 'workspace-package-coverage',
          title: localize('Workspace package coverage', 'Workspace 包覆盖'),
          status: 'warn',
          detail: localize(`These packages are not covered by pnpm-workspace.yaml: ${uncovered.join(', ')}.`, `以下包未被 pnpm-workspace.yaml 覆盖：${uncovered.join(', ')}。`),
          fix: localize('Run repo init --yes to append missing workspace patterns.', '运行 repo init --yes 追加缺失的 workspace 匹配规则。'),
        }))
  }
  return checks
}
