import type { Command } from '@icebreakers/monorepo-templates'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { createSnapshotFreezeRecord, freezeSnapshotSource } from '../../../../commands/release/snapshot/prepared/github'
import { createSnapshotBuildPlan } from '../../../../commands/release/snapshot/prepared/plan'
import { validateSnapshotBuildPlan, validateSnapshotSource } from '../../../../commands/release/snapshot/prepared/schema'
import { localize } from '../../../../i18n'
import { snapshotNumber, snapshotRepository, writeSnapshotOutput } from './output'

export const snapshotBuilderPath = '.github/workflows/repoctl-snapshot-build.yml'

export function registerSnapshotSource(snapshot: Command, cwd: string) {
  snapshot.command('source')
    .description(localize('Resolve the approved same-repository PR and immutable GitHub run identity', '读取已审批的同仓库 PR 与不可变 GitHub 运行身份'))
    .requiredOption('--pr <number>', localize('Same-repository PR number', '同仓库 PR 编号'))
    .option('--repository <owner/repo>', localize('Source repository; defaults to GITHUB_REPOSITORY', '来源仓库；默认 GITHUB_REPOSITORY'))
    .option('--run-id <number>', localize('Builder run ID; defaults to GITHUB_RUN_ID', '构建运行 ID；默认 GITHUB_RUN_ID'))
    .option('--run-attempt <number>', localize('Builder attempt; defaults to GITHUB_RUN_ATTEMPT', '构建尝试；默认 GITHUB_RUN_ATTEMPT'))
    .option('--builder-workflow <path>', localize('Trusted builder workflow path', '可信构建工作流路径'), snapshotBuilderPath)
    .requiredOption('--out <file>', localize('New source identity JSON file', '新的来源身份 JSON 文件'))
    .option('--json', localize('Output JSON', '输出 JSON'))
    .action(async (options: { pr: string, repository?: string, runId?: string, runAttempt?: string, builderWorkflow: string, out: string, json?: boolean }) => {
      const source = await freezeSnapshotSource({
        repository: snapshotRepository(options.repository),
        pullRequest: snapshotNumber(options.pr, 'PR number'),
        runId: snapshotNumber(options.runId ?? process.env['GITHUB_RUN_ID'], 'Builder run ID'),
        runAttempt: snapshotNumber(options.runAttempt ?? process.env['GITHUB_RUN_ATTEMPT'], 'Builder run attempt'),
        workflowPath: options.builderWorkflow,
      })
      await writeSnapshotOutput(source, options, `Frozen PR #${source.pullRequest}: ${source.mergeSha}`)
    })

  snapshot.command('freeze')
    .description(localize('Freeze the package plan from checked-out metadata without candidate scripts', '从检出的元数据冻结包计划，不执行候选脚本'))
    .requiredOption('--source <file>', localize('Source identity produced by snapshot source', 'snapshot source 生成的来源身份'))
    .requiredOption('--out <file>', localize('New frozen plan JSON file', '新的冻结计划 JSON 文件'))
    .option('--json', localize('Output JSON', '输出 JSON'))
    .action(async (options: { source: string, out: string, json?: boolean }) => {
      const source = validateSnapshotSource(JSON.parse(await readFile(options.source, 'utf8')))
      const plan = await createSnapshotBuildPlan({ cwd, source })
      await writeSnapshotOutput(plan, options, `Frozen ${plan.packages.length} snapshot packages for PR #${source.pullRequest}.`)
    })

  snapshot.command('seal')
    .description(localize('Record the uploaded plan artifact identity in the trusted freeze job log', '在可信冻结 job 日志中记录已上传计划 artifact 的身份'))
    .requiredOption('--plan <file>', localize('Frozen plan JSON file', '冻结计划 JSON 文件'))
    .requiredOption('--artifact-id <number>', localize('Uploaded immutable plan artifact ID', '已上传的不可变计划 artifact ID'))
    .requiredOption('--artifact-digest <sha256>', localize('SHA256 returned by upload-artifact', 'upload-artifact 返回的 SHA256'))
    .action(async (options: { plan: string, artifactId: string, artifactDigest: string }) => {
      const plan = validateSnapshotBuildPlan(JSON.parse(await readFile(options.plan, 'utf8')))
      const record = createSnapshotFreezeRecord(plan, { id: snapshotNumber(options.artifactId, 'Plan artifact ID'), digest: options.artifactDigest })
      process.stdout.write(`${record}\n`)
    })
}
