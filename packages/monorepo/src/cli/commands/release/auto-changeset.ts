import type { Command } from '@icebreakers/monorepo-templates'
import type { AutoChangesetReport } from '../../../commands/release/auto-changeset'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { applyAutoChangeset, createAutoChangesetPlan, getAutoChangesetWorkflow } from '../../../commands/release/auto-changeset'
import { localize } from '../../../i18n'

interface Options {
  repository?: string
  pr?: string
  policyPath?: string
  head?: string
  base?: string
  apply?: boolean
  expected?: string
  environment?: string
  workflowPath?: string
  workflowName?: string
  planJobName?: string
  applyJobName?: string
  workflow?: boolean
  out?: string
  json?: boolean
}

export function registerAutoChangeset(release: Command, cwd: string) {
  release.command('auto-changeset')
    .description(localize('Plan or apply approved automatic changesets from immutable GitHub metadata', '从不可变 GitHub 元数据规划或审批写入自动 changeset'))
    .option('--repository <owner/repository>', localize('GitHub repository', 'GitHub 仓库'))
    .option('--pr <number>', localize('Pull request number', 'Pull request 编号'))
    .option('--policy-path <path>', localize('JSON policy on the trusted default branch', '可信默认分支上的 JSON 策略路径'))
    .option('--head <sha>', localize('Expected PR head SHA', '预期 PR head SHA'))
    .option('--base <sha>', localize('Expected PR base SHA', '预期 PR base SHA'))
    .option('--apply', localize('Apply within the protected default-branch workflow', '在受保护的默认分支工作流中写入'))
    .option('--expected <file>', localize('Frozen JSON plan required when applying', '写入时必需的冻结 JSON 计划'))
    .option('--environment <name>', localize('Protected approval environment', '受保护的审批环境'))
    .option('--workflow-path <path>', localize('Trusted workflow repository path', '可信工作流仓库路径'))
    .option('--workflow-name <name>', localize('Exported workflow display name', '导出的工作流名称'))
    .option('--plan-job-name <name>', localize('Trusted plan job name', '可信规划任务名称'))
    .option('--apply-job-name <name>', localize('Protected apply job name', '受保护的写入任务名称'))
    .option('--workflow', localize('Export the thin plan/approval workflow', '导出规划与审批的薄工作流'))
    .option('--out <file>', localize('Write the report or workflow to a file', '将报告或工作流写入文件'))
    .option('--json', localize('Output a versioned JSON report', '输出有版本结构的 JSON 报告'))
    .action(async (options: Options) => {
      const approval = {
        ...(options.environment !== undefined && { environment: options.environment }),
        ...(options.workflowPath !== undefined && { workflowPath: options.workflowPath }),
        ...(options.planJobName !== undefined && { planJobName: options.planJobName }),
        ...(options.applyJobName !== undefined && { applyJobName: options.applyJobName }),
      }
      if (options.workflow) {
        if (options.apply || options.expected) {
          throw new Error('Workflow export cannot apply a changeset.')
        }
        const workflow = await getAutoChangesetWorkflow({
          ...approval,
          ...(options.workflowName !== undefined && { workflowName: options.workflowName }),
          ...(options.policyPath !== undefined && { policyPath: options.policyPath }),
        })
        if (options.out) {
          await writeFile(path.resolve(cwd, options.out), workflow, { flag: 'wx' })
        }
        else {
          process.stdout.write(workflow)
        }
        return
      }
      if (!options.repository || !options.pr || !/^\d+$/u.test(options.pr)) {
        throw new Error('Automatic changesets require --repository and --pr.')
      }
      if (options.apply && !options.expected) {
        throw new Error('--apply requires the frozen --expected JSON plan.')
      }
      const configuration = {
        repository: options.repository,
        pullRequest: Number(options.pr),
        ...(options.policyPath !== undefined && { policyPath: options.policyPath }),
        ...(options.head !== undefined && { expectedHeadSha: options.head }),
        ...(options.base !== undefined && { expectedBaseSha: options.base }),
      }
      let report: AutoChangesetReport
      if (options.apply) {
        const expected = JSON.parse(await readFile(path.resolve(cwd, options.expected!), 'utf8')) as AutoChangesetReport
        if (expected.schemaVersion !== 1 || !expected.revision) {
          throw new Error('Expected input is not a versioned automatic changeset plan.')
        }
        report = await applyAutoChangeset({ ...configuration, expected: expected.revision, approval })
      }
      else {
        report = await createAutoChangesetPlan(configuration)
      }
      const output = `${JSON.stringify(report, null, 2)}\n`
      if (options.out) {
        await writeFile(path.resolve(cwd, options.out), output)
      }
      else {
        process.stdout.write(output)
      }
    })
}
