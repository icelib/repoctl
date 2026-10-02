import type { UpgradePlan } from '../../types/upgrade'
import { localize } from '../../i18n'

export function formatUpgradePlan(plan: UpgradePlan, format: 'text' | 'markdown' = 'text') {
  const heading = localize('Upgrade plan', '升级计划')
  const lines = [format === 'markdown' ? `# ${heading}` : heading, `${plan.status}: ${plan.rootDir}`, '']
  for (const file of plan.files) {
    lines.push(format === 'markdown' ? `## ${file.path}` : file.path)
    lines.push(`${file.status} (${file.reason}): ${file.detail}`)
    if (file.baseline) {
      lines.push(`baseline: ${file.baseline.path} (${file.baseline.beforeHash ?? 'absent'} -> ${file.baseline.afterHash ?? 'removed'})`)
    }
    for (const conflict of file.merge?.conflicts ?? []) {
      lines.push(`Conflict at base lines ${conflict.baseStart}-${conflict.baseEnd}:`, '<<<<<<< local', conflict.local, '||||||| base', conflict.base, '=======', conflict.upstream, '>>>>>>> upstream')
    }
    if (file.diff) {
      lines.push(...(format === 'markdown' ? ['````diff', file.diff, '````'] : [file.diff]))
    }
    else if (['add', 'modify', 'delete'].includes(file.status)) {
      lines.push(file.binary ? localize('Binary file; inspect planned bytes and hashes in JSON.', '二进制文件；请通过 JSON 查看计划中的内容和校验值。') : localize('Text diff omitted because the file exceeds the display limit.', '文件超过展示上限，未生成文本 diff。'))
    }
    lines.push('')
  }
  for (const blocker of plan.blockers) {
    lines.push(`${blocker.id}: ${blocker.path ?? ''} ${blocker.detail}`)
  }
  return lines.join('\n')
}
