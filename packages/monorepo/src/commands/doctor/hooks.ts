import type { DoctorContext } from './types'
import { execFileSync } from 'node:child_process'
import YAML from 'yaml'
import { localize } from '../../i18n'
import fs from '../../utils/fs'
import { createCheck } from './helpers'

export async function collectHooksCheck(context: DoctorContext) {
  const { workspaceDir, packageJson, hasLefthookConfig, hasLegacyHooks } = context
  let problem: string | undefined
  if (!hasLefthookConfig) {
    problem = localize('Missing lefthook.yml.', '缺少 lefthook.yml。')
  }
  else if (!(packageJson.devDependencies?.['lefthook'] ?? packageJson.dependencies?.['lefthook'])) {
    problem = localize('Missing Lefthook dependency.', '缺少 Lefthook 依赖。')
  }
  else {
    try {
      const config = YAML.parse(await fs.readFile(`${workspaceDir}/lefthook.yml`, 'utf8'))
      const missing = ['pre-commit', 'commit-msg', 'pre-push'].filter(hook => !config?.[hook] || !(config[hook].jobs?.length || Object.keys(config[hook].commands ?? {}).length || Object.keys(config[hook].scripts ?? {}).length))
      if (missing.length) {
        problem = localize(`Missing hook jobs: ${missing.join(', ')}.`, `缺少钩子任务：${missing.join(', ')}。`)
      }
    }
    catch {
      problem = localize('Could not parse lefthook.yml.', '无法解析 lefthook.yml。')
    }
  }
  const legacyDependencies = [packageJson.devDependencies, packageJson.dependencies].some(group => group?.['husky'] || group?.['lint-staged'])
  if (!problem && (hasLegacyHooks || legacyDependencies)) {
    problem = localize('Legacy Husky/lint-staged configuration still exists. Migrate custom hooks before removing it.', '仍存在旧 Husky/lint-staged 配置，请迁移自定义钩子后再移除。')
  }
  if (!problem) {
    try {
      const hooksPath = execFileSync('git', ['config', '--get', 'core.hooksPath'], { cwd: workspaceDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
      if (hooksPath) {
        problem = localize(`core.hooksPath still points to ${hooksPath}; Lefthook installation needs attention.`, `core.hooksPath 仍指向 ${hooksPath}，需要检查 Lefthook 安装。`)
      }
    }
    catch {
      // A repository without custom hooksPath, or a project not yet initialized with Git.
    }
  }
  return createCheck({
    id: 'commit-hooks',
    title: localize('Commit hooks', '提交钩子'),
    status: problem ? 'warn' : 'pass',
    detail: problem ?? localize('Found Lefthook dependency and configured pre-commit, commit-msg and pre-push jobs.', '已检测到 Lefthook 依赖及 pre-commit、commit-msg、pre-push 任务。'),
    ...(problem ? { fix: localize('Run repo upgrade --yes for default hooks; migrate custom configuration manually, then run pnpm install and pnpm exec lefthook install.', '默认钩子运行 repo upgrade --yes；自定义配置需手动迁移，然后运行 pnpm install 和 pnpm exec lefthook install。') } : {}),
  })
}
