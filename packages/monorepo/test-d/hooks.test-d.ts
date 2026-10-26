import type { GitHookCheck, GitHooksConfig, GitHooksInstallOptions, GitHooksInstallResult } from '@icebreakers/monorepo'
import { defineMonorepoConfig, installGitHooks } from '@icebreakers/monorepo'
import { expectAssignable, expectError, expectType } from 'tsd'

expectAssignable<GitHookCheck>({ name: 'inventory', run: 'pnpm inventory:check', glob: '**/*.json', stageFixed: true })
expectAssignable<GitHooksConfig>({ preCommit: [{ name: 'skills', run: 'pnpm skills:check' }] })
expectAssignable<GitHooksInstallOptions>({ env: { CI: 'true' } })
expectType<Promise<GitHooksInstallResult>>(installGitHooks('.'))
expectType<Promise<GitHooksInstallResult>>(installGitHooks('.', { env: { LEFTHOOK: '0' } }))
defineMonorepoConfig({ tooling: { hooks: { preCommit: [{ name: 'inventory', run: 'pnpm inventory:check' }] } } })
expectError(defineMonorepoConfig({ tooling: { hooks: { preCommit: [{ name: 'inventory' }] } } }))
