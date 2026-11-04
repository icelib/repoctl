import type { Command } from '@icebreakers/monorepo-templates'
import type { ReleaseBootstrapStage } from '../../../commands/release/types'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { releaseBootstrap } from '../../../commands/release/bootstrap'
import { localize } from '../../../i18n'

interface BootstrapCliOptions {
  stage: string
  package: string
  version: string
  tag: string
  dryRun?: boolean
  verifyRunId?: string
  runId?: string
  runAttempt?: string
  output?: string
  out?: string
  json?: boolean
}

function runNumber(value: string | undefined, label: string) {
  if (value === undefined) {
    return undefined
  }
  const result = Number(value)
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(result)) {
    throw new Error(`${label} must be a positive safe integer`)
  }
  return result
}

export function registerBootstrap(release: Command, cwd: string) {
  release.command('bootstrap')
    .description(localize('Prepare, publish or verify one npm bootstrap prerelease', '准备、发布或核验单个 npm bootstrap 预发布版本'))
    .option('--stage <stage>', 'prepare / publish / verify', 'prepare')
    .requiredOption('--package <name>', localize('Exact public workspace package', '精确指定公开 workspace 包'))
    .requiredOption('--version <version>', localize('Explicit prerelease version', '显式指定预发布版本'))
    .option('--tag <tag>', localize('Non-latest dist-tag', '非 latest 的 dist-tag'), 'alpha')
    .option('--dry-run', localize('Inspect without building or publishing', '只检查，不构建或发布'))
    .option('--verify-run-id <id>', localize('Verify an existing run without publishing', '只核验既有运行，不再次发布'))
    .option('--run-id <id>', localize('Prepared artifact run ID', '准备产物的运行编号'))
    .option('--run-attempt <number>', localize('Prepared artifact run attempt', '准备产物的运行次数'))
    .option('--output <directory>', localize('Safe report and artifact directory', '安全报告与产物目录'))
    .option('--out <file>', localize('Also save the JSON report to a file', '额外保存 JSON 报告文件'))
    .option('--json', localize('Output a versioned JSON report', '输出有版本结构的 JSON 报告'))
    .action(async (options: BootstrapCliOptions) => {
      try {
        if (!['prepare', 'publish', 'verify'].includes(options.stage)) {
          throw new Error('Bootstrap stage must be prepare, publish or verify')
        }
        const verifyRunId = runNumber(options.verifyRunId, 'Verification run ID')
        const runId = runNumber(options.runId, 'Prepared run ID')
        const runAttempt = runNumber(options.runAttempt, 'Prepared run attempt')
        const report = await releaseBootstrap({
          cwd,
          packageName: options.package,
          version: options.version,
          tag: options.tag,
          stage: verifyRunId ? 'verify' : options.stage as ReleaseBootstrapStage,
          ...(verifyRunId ? { verifyRunId } : {}),
          ...(runId ? { runId } : {}),
          ...(runAttempt ? { runAttempt } : {}),
          ...(options.output ? { outputDirectory: options.output } : {}),
          ...(options.dryRun ? { dryRun: true } : {}),
          ...(options.json ? { quiet: true } : {}),
        })
        if (options.out) {
          const reportPath = path.resolve(cwd, options.out)
          await mkdir(path.dirname(reportPath), { recursive: true })
          await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
        }
        process.stdout.write(`${options.json ? JSON.stringify(report, null, 2) : `Bootstrap ${report.status}: ${options.package}@${options.version} (${options.tag})`}\n`)
        if (report.status === 'failed') {
          if (!options.json && report.error) {
            process.stderr.write(`${report.error}\n`)
          }
          process.exitCode = 1
        }
      }
      catch (error) {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
        process.exitCode = 1
      }
    })
}
