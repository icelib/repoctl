import type { DoctorCheck, DoctorContext } from './types'
import process from 'node:process'
import { satisfies } from 'semver'
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
    packageJson,
    packageJsonError,
    workspaceDir,
    workspaceManifestError,
    workspacePackageDiscoveryError,
    workspacePackageDirs,
    workspacePatterns,
  } = context
  const checks: DoctorCheck[] = [
    hasPackageJson && !packageJsonError
      ? createCheck({
          id: 'package-json',
          title: 'package.json',
          status: 'pass',
          detail: localize(`Found root package.json: ${workspaceDir}/package.json`, `已找到根 package.json：${workspaceDir}/package.json`),
        })
      : hasPackageJson
        ? createCheck({
            id: 'package-json',
            title: 'package.json',
            status: 'fail',
            detail: localize(`The root package.json is invalid: ${packageJsonError ?? 'unable to read the manifest'}.`, `根 package.json 无效：${packageJsonError ?? '无法读取清单'}。`),
            fix: localize('Fix the root package.json syntax, then run repo doctor again.', '请修复根 package.json 语法，然后重新运行 repo doctor。'),
          })
        : createCheck({
            id: 'package-json',
            title: 'package.json',
            status: 'fail',
            detail: localize('The current directory does not contain a root package.json.', '当前目录缺少根 package.json。'),
            fix: localize('Run the command from the monorepo root or initialize the workspace first.', '请在 monorepo 根目录执行命令，或先完成工作区初始化。'),
          }),
    hasWorkspaceManifest && !workspaceManifestError
      ? createCheck({
          id: 'workspace-manifest',
          title: 'pnpm workspace',
          status: 'pass',
          detail: localize(`Found a pnpm workspace with ${packageCount} package(s).`, `已找到 pnpm workspace，当前识别到 ${packageCount} 个 workspace 包。`),
        })
      : hasWorkspaceManifest
        ? createCheck({
            id: 'workspace-manifest',
            title: 'pnpm workspace',
            status: 'fail',
            detail: localize(`pnpm-workspace.yaml is invalid: ${workspaceManifestError ?? 'unable to parse the manifest'}.`, `pnpm-workspace.yaml 无效：${workspaceManifestError ?? '无法解析该文件'}。`),
            fix: localize('Fix the YAML syntax in pnpm-workspace.yaml, then run repo doctor again.', '请修复 pnpm-workspace.yaml 中的 YAML 语法，然后重新运行 repo doctor。'),
          })
        : createCheck({
            id: 'workspace-manifest',
            title: 'pnpm workspace',
            status: 'fail',
            detail: localize('pnpm-workspace.yaml is missing; this directory is not a complete pnpm monorepo root.', '缺少 pnpm-workspace.yaml，当前目录不是完整的 pnpm monorepo 根目录。'),
            fix: localize('Run repo init --yes or switch to the workspace root.', '运行 repo init --yes，或切换到 workspace 根目录。'),
          }),
  ]

  if (workspacePackageDiscoveryError) {
    checks.push(createCheck({
      id: 'workspace-package-discovery',
      title: localize('Workspace package discovery', 'Workspace 包发现'),
      status: 'fail',
      detail: localize(`Unable to inspect every workspace package manifest: ${workspacePackageDiscoveryError}.`, `无法检查全部 workspace 包清单：${workspacePackageDiscoveryError}。`),
      fix: localize('Fix or remove the malformed package.json, then run repo doctor again.', '请修复或移除损坏的 package.json，然后重新运行 repo doctor。'),
    }))
  }

  const nodeRange: unknown = packageJson.engines?.node
  if (nodeRange === undefined) {
    checks.push(createCheck({
      id: 'node-version',
      title: localize('Node version', 'Node 版本'),
      status: 'warn',
      detail: localize('The root package.json does not declare engines.node.', '根 package.json 未声明 engines.node。'),
      fix: localize('Declare package.json engines.node to keep runtimes consistent.', '请声明 package.json engines.node 以保持运行时一致。'),
    }))
  }
  else if (typeof nodeRange !== 'string' || nodeRange.length === 0) {
    checks.push(createCheck({
      id: 'node-version',
      title: localize('Node version', 'Node 版本'),
      status: 'fail',
      detail: localize('package.json engines.node must be a valid semver range.', 'package.json 的 engines.node 必须是有效的 semver 范围。'),
      fix: localize('Set engines.node to a valid semver range, then run repo doctor again.', '请将 engines.node 设置为有效的 semver 范围，然后重新运行 repo doctor。'),
    }))
  }
  else {
    let isCompatible = false
    try {
      isCompatible = satisfies(process.version, nodeRange)
    }
    catch {
      checks.push(createCheck({
        id: 'node-version',
        title: localize('Node version', 'Node 版本'),
        status: 'fail',
        detail: localize(`package.json engines.node is not a valid semver range: ${nodeRange}.`, `package.json 的 engines.node 不是有效的 semver 范围：${nodeRange}。`),
        fix: localize('Set engines.node to a valid semver range, then run repo doctor again.', '请将 engines.node 设置为有效的 semver 范围，然后重新运行 repo doctor。'),
      }))
    }
    if (isCompatible) {
      checks.push(createCheck({
        id: 'node-version',
        title: localize('Node version', 'Node 版本'),
        status: 'pass',
        detail: localize(`Node ${process.version} satisfies ${nodeRange}.`, `当前 Node 版本 ${process.version} 满足要求 ${nodeRange}。`),
      }))
    }
    else if (!checks.some(check => check.id === 'node-version' && check.status === 'fail')) {
      checks.push(createCheck({
        id: 'node-version',
        title: localize('Node version', 'Node 版本'),
        status: 'fail',
        detail: localize(`Node ${process.version} does not satisfy ${nodeRange}.`, `当前 Node 版本 ${process.version} 不满足要求 ${nodeRange}。`),
        fix: localize('Switch to a version allowed by package.json engines.node before continuing.', '继续之前，请切换到 package.json engines.node 允许的版本。'),
      }))
    }
  }

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

  const missingPatterns = workspacePackageDirs.filter(dir => !isWorkspacePatternCovered(dir, workspacePatterns))
  if (hasWorkspaceManifest && !workspaceManifestError) {
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
