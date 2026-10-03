import type { Command } from '@icebreakers/monorepo-templates'
import type { OutputOptions } from './output'
import process from 'node:process'
import path from 'pathe'
import { localize } from '../../../i18n'
import fs from '../../../utils/fs'
import { templateWorkspaceRoot } from './output'

interface DriftCliOptions extends OutputOptions {
  markdown?: boolean
  remote?: boolean
  sourceDir?: string
  strict?: boolean
}

export function registerTemplateDriftCommand(templates: Command) {
  templates.command('drift')
    .description(localize('Inspect template versions and managed file drift without changing assets', '只读诊断模板版本、基线和受管文件漂移'))
    .option('--source-dir <directory>', localize('Compare with metadata from an extracted template package', '与已解压模板包的真实版本元数据比较'))
    .option('--remote', localize('Explicitly query the public npm latest dist-tag', '显式查询公共 npm 仓库的 latest 版本'))
    .option('--strict', localize('Fail on active warnings, including unavailable evidence', '存在有效告警或证据不可用时失败'))
    .option('--json', localize('Output structured JSON', '输出结构化 JSON'))
    .option('--markdown', localize('Output a Markdown report (default)', '输出 Markdown 报告（默认）'))
    .option('--out <file>', localize('Write only the report to this file', '仅将诊断报告写入指定文件'))
    .action(async (options: DriftCliOptions, command: Command) => {
      const { checkTemplateDrift, formatTemplateDriftReport, hasTemplateDriftIssues } = await import('../../../commands/template-drift')
      const merged: DriftCliOptions = { ...command.optsWithGlobals(), ...options }
      const report = await checkTemplateDrift(await templateWorkspaceRoot(), { ...(merged.sourceDir ? { sourceDir: merged.sourceDir } : {}), ...(merged.remote !== undefined ? { remote: merged.remote } : {}) })
      const content = merged.json ? JSON.stringify(report, null, 2) : formatTemplateDriftReport(report)
      if (merged.out) {
        await fs.outputFile(path.resolve(merged.out), `${content}\n`)
      }
      else {
        process.stdout.write(`${content}\n`)
      }
      if (hasTemplateDriftIssues(report, merged.strict)) {
        process.exitCode = 1
      }
    })
}
