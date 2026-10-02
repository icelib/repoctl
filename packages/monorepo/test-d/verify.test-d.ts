import type { CommitMsgVerifyOptions, PreCommitVerifyOptions, PrePushVerifyOptions, StagedTypecheckOptions } from '..'
import { expectAssignable, expectType } from 'tsd'
import { verifyCommitMsg, verifyPreCommit, verifyPrePush, verifyStagedTypecheck } from '..'

expectAssignable<PrePushVerifyOptions>({ cwd: '.', stdinText: '', workspaces: [] })
expectAssignable<StagedTypecheckOptions>({ cwd: '.' })
expectAssignable<PreCommitVerifyOptions>({ cwd: '.' })
expectAssignable<CommitMsgVerifyOptions>({ cwd: '.', editFile: '.git/COMMIT_EDITMSG' })
expectType<Promise<void>>(verifyPrePush())
expectType<Promise<void>>(verifyPreCommit())
expectType<Promise<void>>(verifyCommitMsg({ editFile: '.git/COMMIT_EDITMSG' }))
expectType<void>(verifyStagedTypecheck([]))
