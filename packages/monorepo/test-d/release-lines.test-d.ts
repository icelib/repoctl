import type { ReleaseBranchesConfig, ReleaseBranchRule, ReleaseCommandConfig, ReleasePlan } from '@icebreakers/monorepo'
import { createReleasePlan, exitPrerelease, resolveReleaseBranches } from '@icebreakers/monorepo'
import { expectAssignable, expectNotAssignable, expectType } from 'tsd'

const branches: ReleaseBranchesConfig = {
  stable: 'master',
  maintenance: [{ branch: '1.x', range: '1.x', tag: 'legacy-1' }],
  prerelease: [{ branch: 'preview', lane: 'beta', tag: 'legacy-beta', target: '1.x' }],
}
expectAssignable<ReleaseCommandConfig>({ branches })
expectNotAssignable<ReleaseBranchesConfig>({ maintenance: [{ branch: '1.x', tag: 'legacy-1' }] })
expectNotAssignable<ReleaseBranchesConfig>({ stable: false })
expectType<ReleaseBranchRule[]>(resolveReleaseBranches(branches))
expectType<Promise<ReleasePlan>>(createReleasePlan({ cwd: '.', branch: '1.x', config: { branches } }))
expectType<Promise<{ branch: string, lane: string }>>(exitPrerelease({ cwd: '.', branch: 'preview', config: { branches } }))
