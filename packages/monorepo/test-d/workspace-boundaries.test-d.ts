import type { WorkspaceBoundariesConfig, WorkspaceBoundariesReport } from '@icebreakers/monorepo'
import { checkWorkspaceBoundaries, defineMonorepoConfig } from '@icebreakers/monorepo'
import { expectAssignable, expectError, expectType } from 'tsd'

const boundaries = { cycles: false, rules: [{ id: 'shared', from: { paths: ['packages/**'] }, allow: [{ private: false }] }] } satisfies WorkspaceBoundariesConfig
expectType<Promise<WorkspaceBoundariesReport>>(checkWorkspaceBoundaries('.'))
expectType<Promise<WorkspaceBoundariesReport>>(checkWorkspaceBoundaries('.', { config: boundaries }))
expectAssignable<WorkspaceBoundariesConfig | undefined>(defineMonorepoConfig({ boundaries }).boundaries)
expectError(checkWorkspaceBoundaries('.', { config: { cycles: { severity: 'ignore' } } }))
expectError(checkWorkspaceBoundaries('.', { config: { exceptions: [{ rule: 'cycle', source: '.', target: '.', type: 'dependencies' }] } }))
