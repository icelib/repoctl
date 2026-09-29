import type { GitHubOperations, ReleaseAfterPublishHookConfig, ReleaseLifecycleState, ReleaseStateSnapshot } from '..'
import { expectAssignable, expectNotAssignable, expectType } from 'tsd'
import { parsePublishSummary, publishStable } from '..'

type ReleaseOptions = Parameters<typeof publishStable>[0]
const options: ReleaseOptions = { cwd: '.', sleep: async (_milliseconds: number) => {} }
expectType<Promise<Array<{ name: string, version: string }>>>(publishStable(options))
expectType<Array<{ name: string, version: string }>>(parsePublishSummary('{"publishedPackages":[]}'))

const hook: ReleaseAfterPublishHookConfig = { script: 'publish:extension', idempotent: true }
expectAssignable<ReleaseAfterPublishHookConfig>(hook)
expectNotAssignable<ReleaseAfterPublishHookConfig>({ script: 'publish', idempotent: 'yes' })
declare const state: ReleaseLifecycleState
declare const github: Required<Pick<GitHubOperations, 'readReleaseState' | 'writeReleaseState' | 'readTagTarget'>>
expectType<Promise<ReleaseStateSnapshot | undefined>>(github.readReleaseState('key'))
expectType<Promise<string>>(github.writeReleaseState('key', state, 'revision'))
expectType<Promise<string | undefined>>(github.readTagTarget('pkg@1.0.0'))
expectNotAssignable<ReleaseLifecycleState>({ schemaVersion: 1, complete: true })
