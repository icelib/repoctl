import type { DocsContext } from './config'
import type { DocsDeploymentPlan, DocsOptions } from './types'
import { readFile } from 'node:fs/promises'
import spawn from 'cross-spawn'
import { DocsDiagnosticError } from './diagnostics'

export function runDocsProcess(options: DocsOptions, source: string, args: string[], env: NodeJS.ProcessEnv) {
  const result = (options.spawn ?? spawn.sync)('pnpm', args, { cwd: source, env, stdio: options.json ? ['inherit', 2, 2] : 'inherit' })
  if (result.error || result.status !== 0) {
    throw new DocsDiagnosticError('process-failed')
  }
}

export function docsEnvironment(context: DocsContext, plan: DocsDeploymentPlan, resultFile: string) {
  const target = context.site[plan.channel]
  return {
    ...context.env,
    LEFTHOOK: '0',
    REPO_DOCS_SITE: plan.site,
    REPO_DOCS_CHANNEL: plan.channel,
    REPO_DOCS_SOURCE_SHA: plan.sourceSha,
    REPO_DOCS_TREE_SHA: plan.treeSha,
    REPO_DOCS_RELEASE_ID: plan.releaseId ?? '',
    REPO_DOCS_DEPLOYMENT_ID: plan.deploymentId,
    REPO_DOCS_URL: target.url ?? '',
    REPO_DOCS_RESULT_FILE: resultFile,
  }
}

export async function readDeploymentResult(filename: string) {
  let value: unknown
  try {
    value = JSON.parse(await readFile(filename, 'utf8'))
  }
  catch {
    throw new DocsDiagnosticError('script-result-invalid')
  }
  if (!value || typeof value !== 'object' || !('versionId' in value) || typeof value.versionId !== 'string' || !value.versionId.trim()
    || ('url' in value && (typeof value.url !== 'string' || !/^https?:\/\//.test(value.url)))) {
    throw new DocsDiagnosticError('script-result-invalid')
  }
  return { versionId: value.versionId, ...('url' in value ? { url: value.url as string } : {}) }
}
