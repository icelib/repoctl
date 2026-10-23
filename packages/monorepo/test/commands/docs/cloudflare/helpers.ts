import type { DocsCloudflareWorkersTarget, DocsOptions } from '@icebreakers/monorepo'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { vi } from 'vitest'
import { commit, fixture, makeRecord, put } from '../helpers'

export const accountId = 'a'.repeat(32)
export const versionId = '12345678-1234-1234-1234-123456789abc'
export const otherVersion = '87654321-4321-4321-4321-cba987654321'
export const target: DocsCloudflareWorkersTarget = {
  provider: 'cloudflare-workers',
  config: 'website/wrangler.jsonc',
  accountId,
  workerName: 'docs-stable',
  url: 'https://docs.example.invalid',
}

export const wrangler = {
  name: 'docs-stable',
  account_id: accountId,
  compatibility_date: '2026-10-23',
  assets: { directory: 'dist', not_found_handling: '404-page' },
  workers_dev: false,
  routes: [{ pattern: 'docs.example.invalid', custom_domain: true }],
  env: { next: { name: 'docs-next', routes: [{ pattern: 'next.example.invalid', custom_domain: true }] } },
}

export async function nativeFixture(configuration: unknown = wrangler) {
  const h = await fixture()
  await put(h.cwd, 'website/wrangler.jsonc', `${JSON.stringify(configuration)}\n`)
  const sourceSha = commit(h.cwd)
  const record = makeRecord(sourceSha)
  await h.store.github.writeAutomationState(`releases/${record.id}`, record)
  const site = h.options.config!.sites!['website']!
  site.stable = { ...target }
  site.preview = { ...target, workerName: 'docs-next', environment: 'next', url: 'https://next.example.invalid' }
  const options: DocsOptions = {
    ...h.options,
    release: record.id,
    env: { ...h.options.env, CLOUDFLARE_API_TOKEN: 'secret-token', CLOUDFLARE_ACCOUNT_ID: accountId, WRANGLER_CI_OVERRIDE_NAME: '', CLOUDFLARE_API_BASE_URL: '' },
  }
  const calls: string[][] = []
  const state = {
    versionId,
    message: '',
    uploadCount: 0,
    source: '',
    output: '',
    manifest: {} as Record<string, unknown>,
    configuration,
  }
  const callback = { spawn: undefined as ((args: string[], cwd: string, env: NodeJS.ProcessEnv) => void) | undefined }
  const spawn = vi.fn((_command: string, args: string[], process: { cwd: string, env: NodeJS.ProcessEnv }) => {
    calls.push(args)
    if (args[0] === 'install') {
      state.source = process.cwd
      const directory = path.join(process.cwd, 'website/node_modules/wrangler')
      mkdirSync(directory, { recursive: true })
      writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: 'wrangler', version: '4.135.0', bin: { wrangler: 'cli.js' } }))
      writeFileSync(path.join(directory, 'cli.js'), '')
    }
    if (args[1] === 'docs:build') {
      mkdirSync(path.join(process.cwd, 'website/dist'), { recursive: true })
      writeFileSync(path.join(process.cwd, 'website/dist/index.html'), '<h1>Docs</h1>')
    }
    if (args[0] === 'exec') {
      state.uploadCount++
      state.message = `repoctl-docs:${process.env['REPO_DOCS_DEPLOYMENT_ID']}`
      state.output = process.env['WRANGLER_OUTPUT_FILE_PATH']!
      state.manifest = JSON.parse(readFileSync(path.join(state.source, 'website/dist/.well-known/repoctl-deployment.json'), 'utf8'))
      writeFileSync(state.output, `${JSON.stringify({ type: 'deploy', version: 1, worker_name: process.env['REPO_DOCS_CHANNEL'] === 'stable' ? 'docs-stable' : 'docs-next', wrangler_environment: process.env['CLOUDFLARE_ENV'], version_id: state.versionId })}\n`)
    }
    callback.spawn?.(args, process.cwd, process.env)
    return { status: 0, stdout: '', stderr: '' }
  }) as unknown as NonNullable<DocsOptions['spawn']>
  const request = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    if (String(input).endsWith('/deployments')) {
      return Response.json({ success: true, result: { deployments: [{ created_on: '2026-10-23T00:00:00Z', strategy: 'percentage', versions: [{ version_id: state.versionId, percentage: 100 }] }] } })
    }
    return Response.json({ success: true, result: { id: state.versionId, annotations: { 'workers/message': state.message } } })
  })
  options.spawn = spawn
  options.fetch = request
  return { ...h, options, calls, state, callback, request, sourceSha, site }
}

export function api(result: unknown) {
  return Response.json({ success: true, result })
}
