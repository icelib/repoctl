import type { DocsCommandConfig, DocsDeploymentPlan, DocsDeploymentResult, DocsOptions, ReleaseCompletionRecord } from '..'
import { expectAssignable, expectNotAssignable, expectType } from 'tsd'
import { deployDocs, planDocsDeployment } from '..'

expectAssignable<DocsCommandConfig>({ sites: { website: {
  packages: ['core'],
  buildScript: 'docs:build',
  preview: { deployScript: 'docs:preview' },
  stable: { deployScript: 'docs:stable', url: 'https://docs.example.invalid' },
  patchPaths: ['website/**/*.md'],
} } })
expectNotAssignable<DocsCommandConfig>({ sites: { website: { packages: ['core'] } } })
expectNotAssignable<DocsOptions>({ cwd: '.', site: 'website', channel: 'production' })
expectType<Promise<DocsDeploymentPlan>>(planDocsDeployment({ cwd: '.', site: 'website', channel: 'stable', release: 'id' }))
expectType<Promise<DocsDeploymentResult>>(deployDocs({ cwd: '.', site: 'website', channel: 'preview', sourceSha: 'sha' }))
declare const record: ReleaseCompletionRecord
expectType<string>(record.packages[0]!.sourceSha)
