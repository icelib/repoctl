import type { Command } from '@icebreakers/monorepo-templates'
import type { ReleasePlan } from '../../../commands/release/plan'
import process from 'node:process'
import { renderReleasePullRequest } from '../../../commands/release/notes/render'
import { createReleasePlan } from '../../../commands/release/plan'
import { localize, repoctlLocale } from '../../../i18n'

export function formatReleasePlan(plan: ReleasePlan) {
  const cell = (value: unknown) => String(value).replaceAll('|', '\\|').replaceAll('\n', '<br>')
  return [
    '# Release plan',
    '',
    `Status: ${plan.status}; pnpm: ${plan.pnpmVersion ?? 'unknown'}`,
    '',
    '| Package | Current | Planned | Lane | Publish | Reasons |',
    '| --- | --- | --- | --- | --- | --- |',
    ...plan.packages.map(pkg => `| ${[pkg.name, pkg.currentVersion, pkg.newVersion, pkg.lane, pkg.publishCandidate, pkg.reasons.join(', ')].map(cell).join(' | ')} |`),
    ...plan.blockers.flatMap(blocker => ['', `- ${blocker.id}: ${blocker.detail}`]),
    '',
    renderReleasePullRequest(plan.notes, { locale: repoctlLocale }),
  ].join('\n')
}

export function registerReleasePlan(release: Command, cwd: string) {
  release.command('plan')
    .description(localize('Preview native pnpm versioning without consuming intents or running release hooks', '只读预览 pnpm 版本计划，不消费 intents 或执行发布 hooks'))
    .option('--json', localize('Output a versioned JSON plan', '输出有版本结构的 JSON 计划'))
    .option('--markdown', localize('Output Markdown with release-note previews', '输出包含发布说明预览的 Markdown'))
    .action(async (options: { json?: boolean }) => {
      const plan = await createReleasePlan({ cwd })
      process.stdout.write(`${options.json ? JSON.stringify(plan, null, 2) : formatReleasePlan(plan)}\n`)
      if (plan.status === 'blocked') {
        process.exitCode = 1
      }
    })
}
