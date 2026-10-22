import type { ChangelogFunctions } from '@changesets/types'
import type * as CommonJS from '@icebreakers/changelog-github' with { 'resolution-mode': 'require' }
import changelogFunctions, {
  formatHeadline,
  getDependencyReleaseLine,
  getReleaseLine,
  parseConventionalHeadline,
} from '@icebreakers/changelog-github'
import { expectType } from 'tsd'

declare const commonjs: typeof CommonJS

expectType<ChangelogFunctions>(changelogFunctions)
expectType<ChangelogFunctions['getDependencyReleaseLine']>(getDependencyReleaseLine)
expectType<ChangelogFunctions['getReleaseLine']>(getReleaseLine)
expectType<{ text: string, breaking: boolean }>(formatHeadline('feat: add smoke test'))
expectType<{
  type?: string | undefined
  scope?: string | undefined
  breaking: boolean
  description: string
}>(parseConventionalHeadline('feat(core)!: add smoke test'))

expectType<ChangelogFunctions['getReleaseLine']>(commonjs.getReleaseLine)
expectType<{ text: string, breaking: boolean }>(commonjs.formatHeadline('feat: test CommonJS declarations'))
