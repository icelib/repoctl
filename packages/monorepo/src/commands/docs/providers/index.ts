import type { DocsSiteConfig } from '../../../types/docs'
import type { DocsDeploymentPlan, DocsOptions } from '../types'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'pathe'
import { readDeploymentResult, runDocsProcess } from '../execute'
import { stampDocsManifest } from '../manifest'
import { activeMatchingVersion, cloudflareClient, deploymentMessage } from './cloudflare/client'
import { preflightConfiguration } from './cloudflare/config'
import { localWrangler, readWranglerVersion, wranglerEnvironment } from './cloudflare/wrangler'

/** Select a closed provider contract without changing script targets or frozen plan identities. */
export async function prepareDocsProvider(options: DocsOptions, source: string, site: DocsSiteConfig, plan: DocsDeploymentPlan, env: NodeJS.ProcessEnv, resultFile: string) {
  const target = site[plan.channel]
  if (target.provider !== 'cloudflare-workers') {
    return async () => async () => {
      runDocsProcess(options, source, ['run', target.deployScript], env)
      return readDeploymentResult(resultFile)
    }
  }
  const config = await preflightConfiguration(source, site, plan.channel)
  const client = cloudflareClient(target, env, options.fetch)
  // Credential, target and remote-state failures must precede installation/build effects.
  await activeMatchingVersion(client, plan.deploymentId)
  return async () => {
    const current = await preflightConfiguration(source, site, plan.channel)
    if (JSON.stringify(current) !== JSON.stringify(config)) {
      throw new Error('Cloudflare configuration changed during the documentation build')
    }
    await stampDocsManifest(source, config.output, plan)
    const cli = await localWrangler(source, config.filename)
    // Only this returned operation may upload; local acceptance finishes before the deploying CAS.
    return async () => {
      let versionId = await activeMatchingVersion(client, plan.deploymentId)
      if (!versionId) {
        const temporary = await mkdtemp(path.join(tmpdir(), 'repoctl-docs-cloudflare-'))
        const output = path.join(temporary, 'wrangler.jsonl')
        try {
          runDocsProcess(options, path.dirname(config.filename), ['exec', 'node', cli, 'deploy', '--config', config.filename, '--env', config.environment, '--message', deploymentMessage(plan.deploymentId)], wranglerEnvironment(env, target.accountId, config.environment, output))
          versionId = await readWranglerVersion(output, target.workerName, config.environment)
          if (await activeMatchingVersion(client, plan.deploymentId) !== versionId) {
            throw new Error('Uploaded documentation version is not confirmed active; retry the same deployment')
          }
        }
        finally {
          await rm(temporary, { recursive: true, force: true })
        }
      }
      return { versionId, ...(target.url ? { url: target.url } : {}) }
    }
  }
}
