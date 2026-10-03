import type { ConfigExplanation, ConfigValidationReport } from '@icebreakers/monorepo'
import { explainMonorepoConfig, resolveCommandValues, validateConfigFile } from '@icebreakers/monorepo'
import { expectError, expectType } from 'tsd'

expectType<Promise<ConfigExplanation>>(explainMonorepoConfig('/repo', { command: 'ai' }))
expectType<Promise<ConfigValidationReport>>(validateConfigFile('/repo'))
expectType<boolean | undefined>(resolveCommandValues('clean', {}, { includePrivate: false }).values.includePrivate)
expectError(resolveCommandValues('clean', {}, { includePrivate: 'yes' }))
expectError(resolveCommandValues('unknown'))

expectType<string[] | undefined>(resolveCommandValues('env', {}, { tasks: ['test'] }).values.tasks)
expectType<boolean | undefined>(resolveCommandValues('env').values.frameworkInference)
expectError(resolveCommandValues('env', {}, { tasks: 'test' }))
expectType<string | undefined>(resolveCommandValues('release', { branches: { stable: 'main' } }).values.branches?.stable)
