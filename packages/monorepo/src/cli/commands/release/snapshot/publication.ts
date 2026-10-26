import type { Command } from '@icebreakers/monorepo-templates'
import type { VerifySnapshotRunOptions } from '../../../../commands/release/snapshot/prepared/github/types'
import path from 'node:path'
import process from 'node:process'
import { verifySnapshotRun } from '../../../../commands/release/snapshot/prepared/github'
import { publishPreparedSnapshot } from '../../../../commands/release/snapshot/prepared/publish'
import { localize } from '../../../../i18n'
import { snapshotNumber, snapshotRepository, writeSnapshotOutput } from './output'
import { snapshotBuilderPath } from './source'

interface VerificationOptions {
  repository?: string
  runId: string
  runAttempt: string
  artifactId?: string
  builderWorkflow: string
  builderSha256: string
  environment: string
  out?: string
  json?: boolean
}

function registerVerificationOptions(command: Command) {
  return command
    .option('--repository <owner/repo>', localize('Source repository; defaults to GITHUB_REPOSITORY', '来源仓库；默认 GITHUB_REPOSITORY'))
    .requiredOption('--run-id <number>', localize('Completed builder workflow run ID', '已完成的构建工作流运行 ID'))
    .requiredOption('--run-attempt <number>', localize('Exact completed builder attempt', '已完成的精确构建尝试'))
    .option('--artifact-id <number>', localize('Expected immutable build artifact ID', '预期的不可变构建 artifact ID'))
    .option('--builder-workflow <path>', localize('Trusted builder workflow path', '可信构建工作流路径'), snapshotBuilderPath)
    .requiredOption('--builder-sha256 <sha256>', localize('Reviewed builder workflow SHA256 from the trusted publisher policy', '可信发布策略中的已审核构建工作流 SHA256'))
    .option('--environment <name>', localize('Required protected build environment', '构建所需的受保护环境'), 'pr-snapshot')
    .option('--out <file>', localize('Write the result to a new JSON file', '将结果写入新的 JSON 文件'))
    .option('--json', localize('Output JSON', '输出 JSON'))
}

function verificationOptions(options: VerificationOptions): VerifySnapshotRunOptions {
  return {
    repository: snapshotRepository(options.repository),
    runId: snapshotNumber(options.runId, 'Builder run ID'),
    runAttempt: snapshotNumber(options.runAttempt, 'Builder run attempt'),
    ...(options.artifactId ? { artifactId: snapshotNumber(options.artifactId, 'Build artifact ID') } : {}),
    policy: { workflowPath: options.builderWorkflow, workflowSha256: options.builderSha256, environment: options.environment },
  }
}

export function registerSnapshotPublication(snapshot: Command, cwd: string) {
  registerVerificationOptions(snapshot.command('verify')
    .description(localize('Verify the completed approved build without requesting npm credentials', '核验已完成的审批构建，不请求 npm 凭据')))
    .action(async (options: VerificationOptions) => {
      const result = await verifySnapshotRun(verificationOptions(options))
      await writeSnapshotOutput({ schemaVersion: 1, plan: result.plan, evidence: result.evidence }, options, `Verified snapshot artifact ${result.evidence.buildArtifact.id} for PR #${result.plan.source.pullRequest}.`)
    })

  registerVerificationOptions(snapshot.command('publish-prepared')
    .description(localize('Publish verified immutable tarballs from the trusted default-branch publisher', '从默认分支可信 publisher 发布核验过的不可变 tarball')))
    .requiredOption('--output <directory>', localize('External publication report directory', '外部发布报告目录'))
    .action(async (options: VerificationOptions & { output: string }) => {
      const report = await publishPreparedSnapshot({ ...verificationOptions(options), outputDirectory: path.resolve(cwd, options.output) })
      await writeSnapshotOutput(report, options, `Snapshot publication: ${report.status}\n${report.installCommand}`)
      if (report.status === 'failed') {
        process.exitCode = 1
      }
    })
}
