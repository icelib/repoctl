import type * as CommonJS from '@icebreakers/eslint-config' with { 'resolution-mode': 'require' }
import type {
  ConfigNames,
  FlatConfigComposer,
  IcebreakerEslintConfig,
  IcebreakerLegacyEslintConfig,
  OptionsConfig,
  TypedFlatConfigItem,
  UserConfigItem,
  UserDefinedOptions,
} from '@icebreakers/eslint-config'
import type * as CommonJSStylelint from '@icebreakers/eslint-config/stylelint' with { 'resolution-mode': 'require' }
import type { Linter } from 'eslint'
import { getPresets, icebreaker, icebreakerLegacy } from '@icebreakers/eslint-config'
import { expectAssignable, expectType } from 'tsd'

declare const commonjs: typeof CommonJS

expectAssignable<FlatConfigComposer<TypedFlatConfigItem, ConfigNames>>(icebreaker())
expectAssignable<FlatConfigComposer<TypedFlatConfigItem, ConfigNames>>(icebreakerLegacy())
expectAssignable<UserDefinedOptions>({ miniProgram: true })
expectAssignable<UserDefinedOptions>({ weapp: true })
expectAssignable<UserDefinedOptions>({ unocss: true })
expectAssignable<UserDefinedOptions>({ tailwindcss: true })
expectAssignable<UserDefinedOptions>({
  betterTailwindcss: {
    entryPoint: './src/style.css',
    cwd: './apps/demo',
  },
})
expectAssignable<UserDefinedOptions>({
  unocss: {
    strict: true,
    attributify: false,
    configPath: './uno.config.ts',
  },
})
expectType<IcebreakerEslintConfig>(icebreaker())
expectType<IcebreakerLegacyEslintConfig>(icebreakerLegacy())
expectType<[UserDefinedOptions, ...UserConfigItem[]]>(getPresets())

expectAssignable<FlatConfigComposer<TypedFlatConfigItem, ConfigNames>>(commonjs.icebreaker())
expectAssignable<CommonJS.UserDefinedOptions>({ miniProgram: true })
expectType<CommonJS.IcebreakerEslintConfig>(commonjs.icebreaker())
expectType<CommonJS.IcebreakerLegacyEslintConfig>(commonjs.icebreakerLegacy())
expectAssignable<CommonJSStylelint.IcebreakerStylelintOptions>({})

const configs: Linter.Config[] = [{ rules: { 'no-debugger': 'error' } }]
expectAssignable<UserConfigItem>(configs)
expectAssignable<CommonJS.UserConfigItem>(configs)
expectAssignable<UserConfigItem>(Promise.resolve(configs))
expectAssignable<CommonJS.UserConfigItem>(Promise.resolve(configs))
expectAssignable<OptionsConfig>({ typescript: true })
expectAssignable<CommonJS.OptionsConfig>({ typescript: true })
expectType<[CommonJS.UserDefinedOptions, ...CommonJS.UserConfigItem[]]>(commonjs.getPresets())
expectAssignable<UserDefinedOptions>({ formatters: { css: 'oxfmt' } })
expectAssignable<CommonJS.UserDefinedOptions>({ formatters: { css: 'oxfmt' } })
