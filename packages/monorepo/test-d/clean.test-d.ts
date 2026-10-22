import type { CleanCommandConfig } from '@icebreakers/monorepo'
import { cleanProjects } from '@icebreakers/monorepo'
import { expectAssignable, expectNotAssignable, expectType } from 'tsd'

expectAssignable<CleanCommandConfig>({ dryRun: true, autoConfirm: true, pinnedVersion: 'next', includePrivate: false, ignorePackages: ['keep'] })
expectType<Promise<void>>(cleanProjects('.', { dryRun: true }))
expectNotAssignable<CleanCommandConfig>({ dryRun: 'yes' })
