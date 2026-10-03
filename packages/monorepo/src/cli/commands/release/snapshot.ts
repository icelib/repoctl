import type { Command } from '@icebreakers/monorepo-templates'
import type { SnapshotIdentity, SnapshotReport } from '../../../commands/release/snapshot'
import process from 'node:process'
import { releaseSnapshot } from '../../../commands/release/snapshot'
import { localize } from '../../../i18n'

export function formatSnapshotReport(report: SnapshotReport) {
  return [
    `Snapshot: ${report.status}`,
    `Source: ${report.identity.commit}; build: ${report.identity.buildId}`,
    `Tag: ${report.tag}; registry: ${report.registry}`,
    ...report.packages.map(pkg => `- ${pkg.name}@${pkg.version} (${pkg.reasons.join(', ')})`),
    '',
    report.installCommand,
    ...(report.outputDirectory ? [`Artifacts: ${report.outputDirectory}`] : []),
    ...(report.error ? [`Error: ${report.error}`] : []),
  ].join('\n')
}

export function registerSnapshot(release: Command, cwd: string) {
  release.command('snapshot')
    .description(localize('Prepare isolated PR/nightly packages, optionally publish from authorized CI', '隔离准备 PR/nightly 临时包，可在授权 CI 中发布'))
    .requiredOption('--kind <kind>', 'pr / nightly')
    .option('--pr <number>', localize('Pull request number for pr snapshots', 'PR 快照的 pull request 编号'))
    .requiredOption('--commit <sha>', localize('Full commit matching HEAD', '与 HEAD 一致的完整提交 SHA'))
    .requiredOption('--build-id <identity>', localize('Unique CI build identity; repeat it only to recover the same build', '唯一 CI 构建身份；仅在恢复同一构建时复用'))
    .option('--output <directory>', localize('Artifact parent outside the source repository', '源码仓库以外的产物父目录'))
    .option('--registry <url>', localize('Publication registry, defaults to public npm', '发布 registry，默认公共 npm'))
    .option('--publish', localize('Publish after build and package validation in trusted CI', '在可信 CI 中通过构建与包校验后发布'))
    .option('--dry-run', localize('Only preview identity, candidates, versions and tag', '只预览身份、候选、版本和 tag'))
    .option('--json', localize('Output a versioned JSON report', '输出有版本结构的 JSON 报告'))
    .action(async (options: { kind: string, pr?: string, commit: string, buildId: string, output?: string, registry?: string, publish?: boolean, dryRun?: boolean, json?: boolean }) => {
      try {
        if (!['pr', 'nightly'].includes(options.kind) || (options.kind === 'nightly' && options.pr !== undefined)) {
          throw new Error('Use --kind pr --pr <number> or --kind nightly.')
        }
        const identity: SnapshotIdentity = options.kind === 'pr'
          ? { kind: 'pr', pullRequest: Number(options.pr), commit: options.commit, buildId: options.buildId }
          : { kind: 'nightly', commit: options.commit, buildId: options.buildId }
        const report = await releaseSnapshot({
          cwd,
          identity,
          ...(options.output ? { outputDirectory: options.output } : {}),
          ...(options.registry ? { registry: options.registry } : {}),
          ...(options.publish ? { publish: true } : {}),
          ...(options.dryRun ? { dryRun: true } : {}),
        })
        process.stdout.write(`${options.json ? JSON.stringify(report, null, 2) : formatSnapshotReport(report)}\n`)
        if (report.status === 'failed') {
          process.exitCode = 1
        }
      }
      catch (error) {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
        process.exitCode = 1
      }
    })
}
