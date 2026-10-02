import type { UpgradePlan } from '../../types/upgrade'
import process from 'node:process'
import { checkbox } from '@icebreakers/monorepo-templates'
import path from 'pathe'
import { localize } from '../../i18n'
import { actionable } from './apply/validate'

/** Collect every approval before apply, including atomic migration groups. */
export async function selectUpgradeFiles(plan: UpgradePlan) {
  const groups = new Map<string, UpgradePlan['files']>()
  for (const file of plan.files.filter(actionable)) {
    const key = file.group ? `group:${file.group}` : path.join(plan.rootDir, file.path)
    groups.set(key, [...groups.get(key) ?? [], file])
  }
  const selected = [...groups].filter(([, files]) => files.every(file => file.automatic)).map(([key]) => key)
  const pending = [...groups].filter(([key]) => !selected.includes(key))
  if (pending.length && process.stdin.isTTY && process.stdout.isTTY) {
    selected.push(...await checkbox({
      message: localize('Select changed managed files to apply', '请选择要应用的受管文件变更'),
      choices: pending.map(([value, files]) => ({ value, name: files.map(file => `${file.status}: ${file.path}`).join(', '), checked: false })),
      loop: false,
    }))
  }
  return selected.flatMap(key => groups.get(key)?.map(file => file.path) ?? [])
}
