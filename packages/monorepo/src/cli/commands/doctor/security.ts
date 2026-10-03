import type { Command } from '@icebreakers/monorepo-templates'
import type { InstallSecurityExpectations, InstallSecurityPresetPlan } from '../../../commands/doctor/security'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { inspectInstallSecurity } from '../../../commands/doctor/security'
import { applyInstallSecurityPreset, planInstallSecurityPreset } from '../../../commands/doctor/security/preset'
import { localize } from '../../../i18n'

interface Options { json?: boolean, strict?: boolean, pnpmVersion?: string, expectations?: string, preset?: string, apply?: string }

async function readJson(filename: string) {
  try {
    return JSON.parse(await readFile(filename, 'utf8')) as unknown
  }
  catch {
    throw new Error('Cannot read the installation policy JSON input; raw parser content is omitted.')
  }
}

export function registerInstallSecurityCommand(doctor: Command, cwd: string) {
  doctor.command('security')
    .description(localize('Inspect effective pnpm installation security settings without running scripts', '只读检查 pnpm 安装安全设置，不执行依赖脚本'))
    .option('--json', localize('Output stable JSON', '输出稳定 JSON'))
    .option('--strict', localize('Fail on policy warnings', '策略警告也返回失败'))
    .option('--pnpm-version <version>', localize('Audit an exact pnpm version without activating it', '按精确 pnpm 版本检查，不激活该版本'))
    .option('--expectations <file>', localize('Read reviewed organization expectations from JSON', '读取已审核的组织期望 JSON'))
    .option('--preset <name>', localize('Preview the optional balanced preset as JSON', '以 JSON 预览可选 balanced 预设'))
    .option('--apply <file>', localize('Apply a reviewed preset plan', '应用已审核的预设计划'))
    .action(async (localOptions: Options, command: Command) => {
      const parentOptions = doctor.opts()
      if (['rules', 'listRules', 'fix'].some(key => parentOptions[key] !== undefined)) {
        throw new Error('doctor security cannot be combined with parent doctor rule selection or fix operations.')
      }
      const inherited = command.optsWithGlobals()
      if (inherited['markdown'] || inherited['out'] || inherited['redact']) {
        throw new Error('doctor security supports --json and --strict; parent report output options cannot be combined with this command.')
      }
      // Commander may parse shared flags on the parent; the selected subcommand owns its plan.
      const options: Options = { ...localOptions, json: localOptions.json ?? inherited['json'], strict: localOptions.strict ?? inherited['strict'], apply: localOptions.apply ?? inherited['apply'] }
      if (options.apply) {
        if (options.preset || options.pnpmVersion || options.expectations) {
          throw new Error('Use --apply alone with a reviewed preset plan.')
        }
        const result = await applyInstallSecurityPreset(cwd, await readJson(options.apply) as InstallSecurityPresetPlan)
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
        return
      }
      const input = { ...(options.pnpmVersion ? { pnpmVersion: options.pnpmVersion } : {}), ...(options.expectations ? { expectations: await readJson(options.expectations) as InstallSecurityExpectations } : {}) }
      if (options.preset) {
        if (options.preset !== 'balanced') {
          throw new Error('Unknown installation security preset. Available preset: balanced.')
        }
        process.stdout.write(`${JSON.stringify(await planInstallSecurityPreset(cwd, input), null, 2)}\n`)
        return
      }
      const report = await inspectInstallSecurity(cwd, input)
      if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
      }
      else {
        for (const check of report.checks) {
          process.stdout.write(`[${check.status}] ${check.id}: ${check.detail}\n`)
        }
        for (const setting of report.settings.filter(item => item.configured)) {
          process.stdout.write(`${setting.key} (${setting.source}, ${setting.state}): ${JSON.stringify(setting.value)}\n`)
        }
        for (const decision of report.builds.decisions) {
          process.stdout.write(`[${decision.decision}] ${decision.package} (${decision.selector}; ${decision.source})\n`)
        }
      }
      if (report.summary.fail || (options.strict && report.summary.warn)) {
        process.exitCode = 1
      }
    })
}
