import type { PrePushVerifyOptions } from '..'
import { expectAssignable, expectType } from 'tsd'
import { verifyPrePush } from '..'

expectAssignable<PrePushVerifyOptions>({ cwd: '.', stdinText: '' })
expectAssignable<PrePushVerifyOptions>({ workspaces: ['apps/admin', 'domains/payments/lib'] })
expectAssignable<PrePushVerifyOptions>({ workspaces: [] })
expectType<Promise<void>>(verifyPrePush({ cwd: '.', stdinText: '', workspaces: [] }))
