import type { PrePushVerifyOptions } from '@icebreakers/monorepo'
import { verifyPrePush } from '@icebreakers/monorepo'
import { expectAssignable, expectType } from 'tsd'

expectAssignable<PrePushVerifyOptions>({ cwd: '.', stdinText: '' })
expectAssignable<PrePushVerifyOptions>({ workspaces: ['apps/admin', 'domains/payments/lib'] })
expectAssignable<PrePushVerifyOptions>({ workspaces: [] })
expectType<Promise<void>>(verifyPrePush({ cwd: '.', stdinText: '', workspaces: [] }))
