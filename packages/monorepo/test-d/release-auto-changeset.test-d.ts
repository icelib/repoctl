import type { AutoChangesetApplyOptions, AutoChangesetPolicy, AutoChangesetReport, AutoChangesetRevision } from '@icebreakers/monorepo'
import { applyAutoChangeset, createAutoChangesetPlan, getAutoChangesetWorkflow } from '@icebreakers/monorepo'
import { expectAssignable, expectError, expectType } from 'tsd'

const policy: AutoChangesetPolicy = {
  schemaVersion: 1,
  paths: [{ patterns: ['packages-runtime/**'], level: 'patch' }],
  links: [{ from: ['constants'], dependents: true, dependencyFields: ['dependencies'], level: 'same' }],
  summary: { language: 'zh-CN', template: '{title}（#{number}）' },
}
expectType<Promise<AutoChangesetReport>>(createAutoChangesetPlan({ repository: 'owner/repository', pullRequest: 1, policy }))
declare const expected: AutoChangesetRevision
expectAssignable<AutoChangesetApplyOptions>({ repository: 'owner/repository', pullRequest: 1, expected, approval: { environment: 'release-write' } })
expectType<Promise<AutoChangesetReport>>(applyAutoChangeset({ repository: 'owner/repository', pullRequest: 1, expected }))
expectError(applyAutoChangeset({ repository: 'owner/repository', pullRequest: 1 }))
expectType<Promise<string>>(getAutoChangesetWorkflow({ workflowPath: '.github/workflows/changes.yml', environment: 'release-write' }))
