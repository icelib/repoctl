import type { UserConfig } from '@commitlint/types'
import type * as CommonJS from '@icebreakers/commitlint-config' with { 'resolution-mode': 'require' }
import type { IcebreakerCommitlintConfig } from '@icebreakers/commitlint-config'
import {
  createIcebreakerCommitlintConfig,
  icebreaker,
  RuleConfigSeverity,
} from '@icebreakers/commitlint-config'
import { expectAssignable, expectType } from 'tsd'

declare const commonjs: typeof CommonJS

expectType<UserConfig>(createIcebreakerCommitlintConfig())
expectType<IcebreakerCommitlintConfig>(icebreaker())
expectType<UserConfig>(icebreaker({
  types: {
    severity: RuleConfigSeverity.Error,
  },
}))
expectAssignable<RuleConfigSeverity>(RuleConfigSeverity.Error)

expectType<UserConfig>(commonjs.createIcebreakerCommitlintConfig())
expectType<IcebreakerCommitlintConfig>(commonjs.icebreaker())
expectAssignable<RuleConfigSeverity>(commonjs.RuleConfigSeverity.Error)
