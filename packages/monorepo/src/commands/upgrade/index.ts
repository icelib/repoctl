import type { CliOpts } from '../../types'
import type { UpgradeOptions, UpgradePlan } from '../../types/upgrade'
import process from 'node:process'
import { checkbox, ensureTemplateAssetsPrepared } from '@icebreakers/monorepo-templates'
import path from 'pathe'
import { loadMonorepoConfigDetails } from '../../core/config'
import { logger } from '../../core/logger'
import { localize } from '../../i18n'
import { applyUpgradePlan } from './apply'
import { planUpgrade } from './plan'
import { selectUpgradeFiles } from './select'

export { applyUpgradePlan } from './apply'
export { formatUpgradePlan } from './format'
export { setPkgJson } from './pkg-json'
export { planUpgrade } from './plan'

export function upgradeMonorepo(options: UpgradeOptions & { dryRun: true }): Promise<UpgradePlan>
export function upgradeMonorepo(options: CliOpts): Promise<void>
export function upgradeMonorepo(options: UpgradeOptions): Promise<UpgradePlan | void>
/** Existing execution API now plans the complete operation before its first write. */
export async function upgradeMonorepo(options: UpgradeOptions): Promise<UpgradePlan | void> {
  if (options.dryRun) {
    return planUpgrade(options)
  }
  await ensureTemplateAssetsPrepared()
  let plan = await planUpgrade(options)
  if (process.stdin.isTTY && process.stdout.isTTY && plan.status === 'ready') {
    const interactive = options.interactive ?? (await loadMonorepoConfigDetails(plan.cwd)).config.commands?.upgrade?.interactive
    if (interactive) {
      const targets = await checkbox({ message: localize('Select the files you need', '选择你需要的文件'), choices: plan.targets.map(value => ({ value, checked: true })) })
      plan = await planUpgrade({ ...options, targets })
    }
  }
  if (plan.status === 'blocked') {
    throw new Error(plan.blockers.map(item => `${item.id}: ${item.path ?? ''} ${item.detail}`).join('\n'))
  }
  for (const file of plan.files.filter(file => file.status === 'conflict')) {
    logger.warn(`${file.path}: ${file.reason}. ${file.detail}`)
  }
  const files = await selectUpgradeFiles(plan)
  const result = await applyUpgradePlan(plan.cwd, plan, { files })
  for (const filename of result.changed) {
    logger.success(path.join(plan.rootDir, filename))
  }
  if (result.conflicts?.length) {
    throw new Error(`Unresolved upgrade conflicts: ${result.conflicts.join(', ')}`)
  }
}
