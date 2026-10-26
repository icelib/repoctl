import type { GitHookCheck, GitHooksConfig, GitHooksInstallOptions, GitHooksInstallResult } from 'repoctl'
import { defineMonorepoConfig, installGitHooks } from 'repoctl'
import { expectAssignable, expectNotAssignable, expectType } from 'tsd'

expectAssignable<GitHookCheck>({ name: 'inventory', run: 'pnpm inventory:check', glob: '**/*.json', stageFixed: true })
expectAssignable<GitHooksConfig>({ preCommit: [{ name: 'skills', run: 'pnpm skills:check' }] })
expectAssignable<GitHooksInstallOptions>({ env: { CI: 'true' } })
expectType<Promise<GitHooksInstallResult>>(installGitHooks('.'))
expectType<Promise<GitHooksInstallResult>>(installGitHooks('.', { env: { LEFTHOOK: '0' } }))
defineMonorepoConfig({ tooling: { hooks: { preCommit: [{ name: 'inventory', run: 'pnpm inventory:check' }] } } })
expectNotAssignable<GitHookCheck>({ name: 'inventory' })
