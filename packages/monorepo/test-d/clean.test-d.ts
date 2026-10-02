import type { CleanCommandConfig } from '..'
import { expectAssignable, expectNotAssignable, expectType } from 'tsd'
import { cleanProjects } from '..'

expectAssignable<CleanCommandConfig>({ dryRun: true, autoConfirm: true, pinnedVersion: 'next', includePrivate: false, ignorePackages: ['keep'] })
expectType<Promise<void>>(cleanProjects('.', { dryRun: true }))
expectNotAssignable<CleanCommandConfig>({ dryRun: 'yes' })
