import type { Command } from '@icebreakers/monorepo-templates'
import type { ReleasePreparationPolicy } from '../../../commands/release/validation'
import process from 'node:process'
import { readReleasePreparationPolicy, validateReleasePreparation } from '../../../commands/release/validation'
import { localize } from '../../../i18n'

export function registerReleasePreparationValidation(release: Command, cwd: string) {
  release.command('validate-preparation')
    .description(localize('Validate a frozen version-preparation PR without executing candidate code', '只读校验冻结的版本准备 PR，不执行候选代码'))
    .requiredOption('--base <sha>', localize('Trusted full base commit SHA', '可信 base 完整提交 SHA'))
    .requiredOption('--head <sha>', localize('Candidate full head commit SHA', '候选 head 完整提交 SHA'))
    .option('--branch <branch>', localize('Trusted release target line (defaults to main)', '可信目标发布线（默认 main）'))
    .option('--policy <path>', localize('Repository-relative JSON policy read from the frozen base', '从冻结 base 读取的仓库相对 JSON 策略路径'))
    .option('--json', localize('Output a versioned JSON report (default)', '输出带 schema 版本的 JSON 报告（默认）'))
    .action(async (options: { base: string, head: string, branch?: string, policy?: string }) => {
      const policy = options.policy
        ? readReleasePreparationPolicy({ cwd, base: options.base, path: options.policy }) as ReleasePreparationPolicy
        : { branch: options.branch ?? 'main' }
      if (options.policy && options.branch) {
        throw new Error('--branch and --policy are mutually exclusive; the frozen policy selects its release line.')
      }
      const report = await validateReleasePreparation({ cwd, base: options.base, head: options.head, policy })
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
      if (report.status !== 'valid') {
        process.exitCode = 1
      }
    })
}
