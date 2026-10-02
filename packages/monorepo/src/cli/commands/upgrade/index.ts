import type { CliOpts } from '../../../types'
import process from 'node:process'
import { logger } from '../../../core/logger'
import { localize } from '../../../i18n'
import { normalizeCliOpts } from '../../utils'

export async function runUpgradeCommand(cwd: string, options: CliOpts & { dryRun?: boolean, json?: boolean }) {
  const normalized = normalizeCliOpts(cwd, options)
  if (options.dryRun || options.json || options.diff) {
    const { resolveUpgradePlan } = await import('../../../commands')
    const plan = await resolveUpgradePlan(normalized)
    const output = options.json
      ? JSON.stringify(plan, null, 2)
      : [
          localize('Upgrade preview:', '升级预览：'),
          ...plan.files.flatMap((file) => {
            const confirmation = file.requiresConfirmation ? localize(' [confirmation required]', ' [需要确认]') : ''
            const dependencies = file.dependsOn.length
              ? localize(` [depends on: ${file.dependsOn.join(', ')}]`, ` [依赖：${file.dependsOn.join('、')}]`)
              : ''
            const diff = file.diff
            const summary = diff
              ? localize(` [${diff.kind}, +${diff.addedLines}/-${diff.deletedLines}, ${diff.beforeBytes}->${diff.afterBytes} bytes]`, ` [${diff.kind === 'text' ? '文本' : '二进制'}，+${diff.addedLines}/-${diff.deletedLines} 行，${diff.beforeBytes}->${diff.afterBytes} 字节]`)
              : ''
            const lines = [`${file.action}: ${file.path} (${file.reason})${confirmation}${dependencies}${summary}`]
            if (options.diff && diff?.text) {
              lines.push(diff.text)
            }
            return lines
          }),
          localize('Dry run only; no files were written.', '仅执行预览；未写入任何文件。'),
        ].join('\n')
    // Reports are command output, and must not disappear at a quiet log level.
    process.stdout.write(`${output}\n`)
    return
  }
  const { upgradeMonorepo } = await import('../../../commands')
  await upgradeMonorepo(normalized)
  logger.success(localize('Upgrade finished.', '升级完成。'))
}
