import type { DocsCloudflareWorkersTarget, DocsCommandConfig, DocsDeploymentPlan, DocsDeploymentResult, DocsDeploymentTarget, DocsOptions, DocsScriptDeploymentTarget, ReleaseCompletionRecord } from 'repoctl'
import { deployDocs, planDocsDeployment } from 'repoctl'
import { expectAssignable, expectNotAssignable, expectType } from 'tsd'

expectAssignable<DocsCommandConfig>({ sites: {} })
const nativeTarget = {
  provider: 'cloudflare-workers',
  config: 'website/wrangler.jsonc',
  workerName: 'docs-preview',
  accountId: '0123456789abcdef0123456789abcdef',
  environment: 'preview',
  url: 'https://next.example.invalid',
} as const
expectAssignable<DocsCloudflareWorkersTarget>(nativeTarget)
expectAssignable<DocsDeploymentTarget>(nativeTarget)
expectAssignable<DocsCloudflareWorkersTarget>({ provider: 'cloudflare-workers', config: 'website/wrangler.json', workerName: 'docs', accountId: nativeTarget.accountId })
expectAssignable<DocsScriptDeploymentTarget>({ deployScript: 'docs:stable', url: 'https://docs.example.invalid' })
expectAssignable<DocsDeploymentTarget>({ deployScript: 'docs:stable' })
expectAssignable<DocsCommandConfig>({ sites: { website: {
  packages: ['core'],
  buildScript: 'docs:build',
  preview: nativeTarget,
  stable: { deployScript: 'docs:stable' },
  patchPaths: ['website/**/*.md'],
} } })
expectNotAssignable<DocsDeploymentTarget>({ ...nativeTarget, deployScript: 'docs:preview' })
expectNotAssignable<DocsDeploymentTarget>({ deployScript: 'docs:stable', accountId: nativeTarget.accountId })
expectNotAssignable<DocsDeploymentTarget>({ provider: 'script', deployScript: 'docs:stable' })
expectNotAssignable<DocsDeploymentTarget>({ ...nativeTarget, provider: 'cloudflare-pages' })
expectNotAssignable<DocsDeploymentTarget>({ provider: 'cloudflare-workers', config: 'website/wrangler.jsonc', workerName: 'docs' })
expectNotAssignable<DocsCloudflareWorkersTarget>({ provider: 'cloudflare-workers', workerName: 'docs', accountId: nativeTarget.accountId })
declare const target: DocsDeploymentTarget
if (target.provider === 'cloudflare-workers') {
  expectType<string>(target.workerName)
  expectType<string | undefined>(target.environment)
}
else {
  expectType<string>(target.deployScript)
}
declare const request: typeof fetch
expectAssignable<DocsOptions>({ cwd: '.', site: 'website', channel: 'preview', sourceSha: 'sha', fetch: request })
expectNotAssignable<DocsOptions>({ cwd: '.', site: 'website', channel: 'production' })
expectType<Promise<DocsDeploymentPlan>>(planDocsDeployment({ cwd: '.', site: 'website', channel: 'stable', release: 'id' }))
expectType<Promise<DocsDeploymentResult>>(deployDocs({ cwd: '.', site: 'website', channel: 'preview', sourceSha: 'sha' }))
declare const record: ReleaseCompletionRecord
expectType<string>(record.packages[0]!.sourceSha)
