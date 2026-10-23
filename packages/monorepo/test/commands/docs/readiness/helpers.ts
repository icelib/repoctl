import type { DocsOptions } from '@icebreakers/monorepo'
import type { DocsDeploymentState } from '../../../../src/commands/docs/types'
import { writeFileSync } from 'node:fs'
import { planDocsDeployment } from '@icebreakers/monorepo'
import { vi } from 'vitest'
import { docsManifest } from '../../../../src/commands/docs/manifest'
import { fixture } from '../helpers'

export function scriptRunner() {
  const calls: string[][] = []
  const spawn = vi.fn((_command: string, args: string[], options: { env: NodeJS.ProcessEnv }) => {
    calls.push(args)
    if (args[1] === 'docs:stable' || args[1] === 'docs:preview') {
      writeFileSync(options.env['REPO_DOCS_RESULT_FILE']!, JSON.stringify({ versionId: 'saved-script-version', url: 'https://provider.example.invalid' }))
    }
    return { status: 0, stdout: '', stderr: '' }
  }) as unknown as NonNullable<DocsOptions['spawn']>
  return { calls, spawn }
}

export async function readinessFixture(channel: 'stable' | 'preview' = 'stable') {
  const h = await fixture()
  const options: DocsOptions = { ...h.options, channel }
  if (channel === 'preview') {
    delete options.release
    options.sourceSha = h.sha
    options.env = { ...options.env, REPO_DOCS_CONCURRENCY_GROUP: 'docs-website-preview' }
  }
  const target = options.config!.sites!['website']![channel]
  target.readiness = { timeoutMs: 1_000, requestTimeoutMs: 500 }
  const plan = await planDocsDeployment(options)
  const process = scriptRunner()
  options.spawn = process.spawn
  const request = vi.fn(async () => Response.json(docsManifest(plan)))
  options.fetch = request
  const state = () => h.store.records.get(`docs/website/${channel}`)!.value as DocsDeploymentState
  return { ...h, options, target, plan, request, process, state }
}
