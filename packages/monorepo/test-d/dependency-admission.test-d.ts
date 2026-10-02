import type { DependencyAdmissionConfig, DependencyAdmissionReport } from '@icebreakers/monorepo'
import { checkDependencyAdmission, defineMonorepoConfig } from '@icebreakers/monorepo'
import { expectAssignable, expectError, expectType } from 'tsd'

const dependencyPolicy = { rules: [{ id: 'browser', workspaces: ['apps/**'], dependencies: ['legacy-sdk'], effect: 'deny', sections: ['dependencies'], reason: 'Use maintained packages' }] } satisfies DependencyAdmissionConfig
expectType<Promise<DependencyAdmissionReport>>(checkDependencyAdmission('.'))
expectType<Promise<DependencyAdmissionReport>>(checkDependencyAdmission('.', { config: dependencyPolicy, baseline: {}, full: true, now: new Date() }))
expectAssignable<DependencyAdmissionConfig | undefined>(defineMonorepoConfig({ dependencyPolicy }).dependencyPolicy)
expectError(checkDependencyAdmission('.', { config: { rules: [{ ...dependencyPolicy.rules[0], effect: 'ignore' }] } }))
expectError(checkDependencyAdmission('.', { config: { rules: [{ ...dependencyPolicy.rules[0], sections: ['dev'] }] } }))
expectError(checkDependencyAdmission('.', { config: { rules: [], exceptions: [{ rule: 'browser', workspace: '.', section: 'dependencies', dependency: 'old' }] } }))
