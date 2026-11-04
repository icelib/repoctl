import type { BootstrapManifest, BootstrapOptions, BootstrapPlan, BootstrapReport, BootstrapSource, PrepareBootstrapOptions } from '@icebreakers/monorepo'
import { createBootstrapPlan, prepareBootstrap, releaseBootstrap } from '@icebreakers/monorepo'
import { expectAssignable, expectError, expectType } from 'tsd'

const source: BootstrapSource = { repository: 'acme/repo', repositoryId: 12, commit: 'a'.repeat(40), branch: 'main', runId: 123, runAttempt: 1, workflowRef: 'acme/repo/.github/workflows/release.yml@refs/heads/main' }
const options: BootstrapOptions = { cwd: '.', packageName: '@scope/new-package', version: '0.1.0-alpha.0', source }
expectType<Promise<BootstrapPlan>>(createBootstrapPlan(options))
expectType<Promise<BootstrapReport>>(releaseBootstrap({ ...options, dryRun: true }))
expectType<Promise<BootstrapReport>>(releaseBootstrap({ ...options, stage: 'publish', quiet: true }))
declare const plan: BootstrapPlan
declare const manifest: BootstrapManifest
expectType<Promise<BootstrapReport>>(prepareBootstrap({ ...options, plan }))
expectAssignable<PrepareBootstrapOptions>({ ...options, plan })
expectType<'tarballs/package.tgz'>(manifest.package.tarball)
expectType<string[]>(plan.protectedTags)
expectType<string[]>(manifest.package.files)
expectType<'https://registry.npmjs.org/'>(manifest.registry)
expectError<BootstrapOptions>({ cwd: '.', packageName: '@scope/new-package' })
expectError<BootstrapOptions>({ cwd: '.', packageName: '@scope/new-package', packageVersion: '0.1.0-alpha.0' })
expectError<PrepareBootstrapOptions>({ ...options })
