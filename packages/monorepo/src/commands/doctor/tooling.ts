import type { DoctorCheck, DoctorContext, DoctorPackageJson } from './types'
import { readdir } from 'node:fs/promises'
import { localize } from '../../i18n'
import fs from '../../utils/fs'
import { hasLegacyToolingReference } from '../tooling-migration'
import { createCheck } from './helpers'

export const recommendedRepoScripts = {
  'repo:init': 'repo init',
  'repo:new': 'repo new',
  'repo:check': 'repo check',
  'repo:doctor': 'repo doctor',
} as const

function resolveToolPackage(pkgJson: DoctorPackageJson) {
  const version = pkgJson.devDependencies?.['repoctl'] ?? pkgJson.dependencies?.['repoctl']
  return typeof version === 'string' ? { name: 'repoctl', version } : null
}

function hasScript(pkgJson: DoctorPackageJson, name: string) {
  return typeof pkgJson.scripts?.[name] === 'string' && pkgJson.scripts[name]!.length > 0
}

async function findLegacyToolingFiles(context: DoctorContext) {
  const rootFiles = context.isSourceWorkspace
    ? []
    : ['eslint.config.js', 'stylelint.config.js', 'lint-staged.config.js', 'vitest.config.ts']
  const files = [...rootFiles]
  for (const baseDir of ['apps', 'packages', 'examples']) {
    const absoluteBase = `${context.workspaceDir}/${baseDir}`
    if (!await fs.pathExists(absoluteBase)) {
      continue
    }
    for (const entry of await readdir(absoluteBase)) {
      files.push(`${baseDir}/${entry}/eslint.config.js`, `${baseDir}/${entry}/vitest.config.ts`)
    }
  }
  const legacyFiles: string[] = []
  await Promise.all(files.map(async (file) => {
    const candidate = `${context.workspaceDir}/${file}`
    if (await fs.pathExists(candidate) && hasLegacyToolingReference(await fs.readFile(candidate, 'utf8'))) {
      legacyFiles.push(file)
    }
  }))
  return legacyFiles.sort((left, right) => left.localeCompare(right))
}

export async function collectToolingChecks(context: DoctorContext, selected?: ReadonlySet<string>) {
  const checks: DoctorCheck[] = []
  if (!selected || selected.has('tool-package')) {
    const toolPackage = resolveToolPackage(context.packageJson)
    checks.push(toolPackage
      ? createCheck({
          id: 'tool-package',
          title: localize('repo CLI dependency', 'repo CLI 依赖'),
          status: 'pass',
          detail: localize(`Detected CLI dependency: ${toolPackage.name}@${toolPackage.version}`, `已检测到 CLI 依赖：${toolPackage.name}@${toolPackage.version}`),
        })
      : createCheck({
          id: 'tool-package',
          title: localize('repo CLI dependency', 'repo CLI 依赖'),
          status: 'fail',
          detail: localize('The root package.json does not contain a repoctl dependency.', '根 package.json 中没有 repoctl 依赖。'),
          fix: localize('Run repo init --yes or pnpm add -D repoctl.', '运行 repo init --yes，或执行 pnpm add -D repoctl。'),
        }))
  }
  if (!selected || selected.has('root-scripts')) {
    const missing = Object.keys(recommendedRepoScripts).filter(name => !hasScript(context.packageJson, name))
    const unexpected = Object.entries(recommendedRepoScripts)
      .filter(([name, command]) => hasScript(context.packageJson, name) && context.packageJson.scripts?.[name] !== command)
      .map(([name]) => name)
    checks.push(missing.length === 0 && unexpected.length === 0
      ? createCheck({
          id: 'root-scripts',
          title: localize('repo:* root scripts', 'repo:* 根脚本'),
          status: 'pass',
          detail: localize('Found repo:init, repo:new, repo:check, and repo:doctor root scripts.', '已检测到 repo:init、repo:new、repo:check 和 repo:doctor 根脚本。'),
        })
      : createCheck({
          id: 'root-scripts',
          title: localize('repo:* root scripts', 'repo:* 根脚本'),
          status: 'warn',
          detail: localize(
            `Recommended root scripts need attention. Missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'}.`,
            `推荐根脚本需要调整。缺少：${missing.join(', ') || '无'}；命令不一致：${unexpected.join(', ') || '无'}。`,
          ),
          fix: localize('Run repo init --yes or update the scripts in package.json.', '运行 repo init --yes，或更新 package.json 中的脚本。'),
        }))
  }
  if (!selected || selected.has('tooling-imports')) {
    const legacyFiles = await findLegacyToolingFiles(context)
    checks.push(legacyFiles.length === 0
      ? createCheck({
          id: 'tooling-imports',
          title: localize('Tooling imports', 'Tooling 导入'),
          status: 'pass',
          detail: localize('Tooling configuration uses current repoctl entrypoints.', 'Tooling 配置使用当前 repoctl 入口。'),
        })
      : createCheck({
          id: 'tooling-imports',
          title: localize('Tooling imports', 'Tooling 导入'),
          status: 'warn',
          detail: localize(`These files reference legacy tooling entries: ${legacyFiles.join(', ')}.`, `以下文件引用旧 tooling 入口：${legacyFiles.join(', ')}。`),
          fix: localize('Run repo upgrade --yes to migrate to repoctl/tooling.', '运行 repo upgrade --yes 迁移到 repoctl/tooling。'),
        }))
  }
  return checks
}
