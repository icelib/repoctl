import type { DocsCommandConfig, DocsDeploymentPlan, DocsDeploymentResult, DocsOptions, ReleaseCompletionRecord } from 'repoctl'
import { deployDocs, planDocsDeployment } from 'repoctl'
import { expectAssignable, expectNotAssignable, expectType } from 'tsd'

expectAssignable<DocsCommandConfig>({ sites: {} })
expectNotAssignable<DocsOptions>({ cwd: '.', site: 'website', channel: 'production' })
expectType<Promise<DocsDeploymentPlan>>(planDocsDeployment({ cwd: '.', site: 'website', channel: 'stable', release: 'id' }))
expectType<Promise<DocsDeploymentResult>>(deployDocs({ cwd: '.', site: 'website', channel: 'preview', sourceSha: 'sha' }))
declare const record: ReleaseCompletionRecord
expectType<string>(record.packages[0]!.sourceSha)
