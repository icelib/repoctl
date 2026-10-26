import type { Command } from '@icebreakers/monorepo-templates'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { verifyPreparedSnapshotConsumer } from '../../../../commands/release/snapshot/prepared/consumer'
import { prepareSnapshot } from '../../../../commands/release/snapshot/prepared/prepare'
import { validateSnapshotBuildPlan } from '../../../../commands/release/snapshot/prepared/schema'
import { localize } from '../../../../i18n'
import { writeSnapshotOutput } from './output'
import { registerSnapshotPublication } from './publication'
import { registerSnapshotSource } from './source'
import { registerSnapshotWorkflow } from './workflow'

export function registerPreparedSnapshot(snapshot: Command, cwd: string) {
  registerSnapshotSource(snapshot, cwd)
  registerSnapshotPublication(snapshot, cwd)
  registerSnapshotWorkflow(snapshot, cwd)

  snapshot.command('prepare')
    .description(localize('Build the frozen plan into a portable manifest and tarball bundle', '将冻结计划构建为可移交的 manifest 与 tarball bundle'))
    .requiredOption('--plan <file>', localize('Trusted frozen package plan JSON', '可信的冻结包计划 JSON'))
    .requiredOption('--output <directory>', localize('Artifact parent outside the source checkout', '源码 checkout 以外的产物父目录'))
    .option('--out <file>', localize('Write the preparation result to a new JSON file', '将准备结果写入新的 JSON 文件'))
    .option('--json', localize('Output JSON', '输出 JSON'))
    .action(async (options: { plan: string, output: string, out?: string, json?: boolean }) => {
      const plan = validateSnapshotBuildPlan(JSON.parse(await readFile(options.plan, 'utf8')))
      const result = await prepareSnapshot({ cwd, plan, outputDirectory: path.resolve(cwd, options.output) })
      await writeSnapshotOutput(result, options, `Prepared snapshot bundle: ${result.directory}`)
    })

  snapshot.command('verify-consumer')
    .description(localize('Install exact published versions in an isolated job without publishing credentials', '在没有发布凭据的隔离 job 中安装并验证精确已发布版本'))
    .requiredOption('--report <file>', localize('Trusted publication report JSON', '可信发布报告 JSON'))
    .requiredOption('--output <directory>', localize('External consumer evidence directory', '外部消费者证据目录'))
    .option('--out <file>', localize('Write the verification result to a new JSON file', '将验证结果写入新的 JSON 文件'))
    .option('--json', localize('Output JSON', '输出 JSON'))
    .action(async (options: { report: string, output: string, out?: string, json?: boolean }) => {
      const report = JSON.parse(await readFile(options.report, 'utf8'))
      const result = await verifyPreparedSnapshotConsumer({ report, outputDirectory: path.resolve(cwd, options.output) })
      await writeSnapshotOutput(result, options, `Snapshot consumer: ${result.status}`)
      if (result.status === 'failed') {
        process.exitCode = 1
      }
    })
}
