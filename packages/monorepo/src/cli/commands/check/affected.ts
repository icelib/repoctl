import type { AffectedCheckPlan } from '../../../commands/check/affected'
import { localize } from '../../../i18n'

export function formatAffectedCheckPlan(plan: AffectedCheckPlan, markdown = false) {
  return [
    ...(markdown ? [localize('# Affected check plan', '# Affected 校验计划'), ''] : []),
    `cwd: ${plan.cwd}`,
    `mode: affected (${plan.strategy})`,
    `range: ${plan.git.base}...${plan.git.head}${plan.git.includesWorkingTree ? ' + working tree' : ''}`,
    ...plan.fallback.map(reason => `! ${localize('Full fallback', '全量回退')}: ${reason.code}${reason.files ? ` (${reason.files.join(', ')})` : ''}${reason.diagnostics ? ` [${reason.diagnostics.map(item => item.code).join(', ')}]` : ''}`),
    '',
    localize('Packages:', '包选择：'),
    ...plan.packages.map(pkg => `- ${pkg.id}: ${pkg.selected ? 'selected' : pkg.skippedReason}; ${pkg.reasons.map(reason => `${reason.code}${reason.path ? ` (${reason.path.join(' -> ')})` : ''}${reason.files ? ` (${reason.files.join(', ')})` : ''}`).join('; ')}`),
    ...plan.files.filter(file => file.reason === 'documentation').map(file => `- ${file.path}: documentation`),
    '',
    localize('Commands (build first):', '命令（先构建）：'),
    ...plan.commands.flatMap(command => [
      `- ${command.name}: ${command.skipReason ? `skipped (${command.skipReason})` : command.command}`,
      ...(command.missingTargets.length ? [`  missing_script: ${command.missingTargets.join(', ')}`] : []),
      ...(command.prerequisiteTargets.length ? [`  build_prerequisites: ${command.prerequisiteTargets.join(', ')}`] : []),
    ]),
  ].join('\n')
}
