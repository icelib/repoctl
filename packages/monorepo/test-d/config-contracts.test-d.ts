import type { ConfigExplanation, ConfigValidationReport } from '@icebreakers/monorepo'
import { explainMonorepoConfig, resolveCommandValues, validateConfigFile } from '@icebreakers/monorepo'
import { expectError, expectType } from 'tsd'

expectType<Promise<ConfigExplanation>>(explainMonorepoConfig('/repo', { command: 'ai' }))
expectType<Promise<ConfigValidationReport>>(validateConfigFile('/repo'))
expectType<boolean | undefined>(resolveCommandValues('clean', {}, { includePrivate: false }).values.includePrivate)
expectError(resolveCommandValues('clean', {}, { includePrivate: 'yes' }))
expectError(resolveCommandValues('unknown'))
