import type { ReleasePreparationGeneratedFile, ReleasePreparationPolicy, ReleasePreparationValidationOptions, ReleasePreparationValidationReport } from '@icebreakers/monorepo'
import { readReleasePreparationPolicy, validateReleasePreparation } from '@icebreakers/monorepo'
import { expectAssignable, expectNotAssignable, expectType } from 'tsd'

expectAssignable<ReleasePreparationPolicy>({ branch: 'main' })
expectAssignable<ReleasePreparationValidationOptions>({ cwd: '.', base: 'base-sha', head: 'head-sha', policy: { branch: 'main' } })
expectType<Promise<ReleasePreparationValidationReport>>(validateReleasePreparation({ cwd: '.', base: 'base-sha', head: 'head-sha', policy: { branch: 'main' } }))
expectType<unknown>(readReleasePreparationPolicy({ cwd: '.', base: 'base-sha', path: 'release-validation.json' }))
expectAssignable<ReleasePreparationGeneratedFile>({ path: 'generated/versions.json', sha256: 'digest' })
expectAssignable<ReleasePreparationGeneratedFile>({ path: 'generated/versions.json', validate: async () => true })
expectNotAssignable<ReleasePreparationGeneratedFile>({ path: 'generated/versions.json' })
expectNotAssignable<ReleasePreparationGeneratedFile>({ path: 'generated/versions.json', sha256: 'digest', validate: () => true })
