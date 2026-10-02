import type { CleanCommandConfig } from 'repoctl'
import { cleanProjects } from 'repoctl'
import { expectAssignable, expectNotAssignable, expectType } from 'tsd'

expectAssignable<CleanCommandConfig>({ dryRun: true, autoConfirm: true, pinnedVersion: 'next', includePrivate: false, ignorePackages: ['keep'] })
expectType<Promise<void>>(cleanProjects('.', { dryRun: true }))
expectNotAssignable<CleanCommandConfig>({ dryRun: 'yes' })
