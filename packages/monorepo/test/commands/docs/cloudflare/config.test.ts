import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { deployDocs } from '@icebreakers/monorepo'
import { afterEach, expect, it } from 'vitest'
import { cleanup, commit, expectDocsFailure, makeRecord, put } from '../helpers'
import { nativeFixture, target, wrangler } from './helpers'

afterEach(cleanup)

it.each([
  ['missing credentials', { CLOUDFLARE_API_TOKEN: '' }],
  ['wrong account environment', { CLOUDFLARE_ACCOUNT_ID: 'b'.repeat(32) }],
  ['wrong legacy account environment', { CF_ACCOUNT_ID: 'b'.repeat(32) }],
  ['API origin override', { CLOUDFLARE_API_BASE_URL: 'https://example.invalid' }],
  ['legacy API origin override', { CF_API_BASE_URL: 'https://example.invalid' }],
  ['global key overriding the verified token', { CLOUDFLARE_API_KEY: 'secret-global-key' }],
  ['legacy global key overriding the verified token', { CF_API_KEY: 'secret-global-key' }],
  ['Worker override', { WRANGLER_CI_OVERRIDE_NAME: 'other' }],
])('rejects %s before installation and build', async (_label, env) => {
  const h = await nativeFixture()
  await expectDocsFailure(deployDocs({ ...h.options, env: { ...h.options.env, ...env } }), 'preflight', _label === 'missing credentials' ? 'credentials-missing' : 'provider-environment-conflict')
  expect(h.calls).toEqual([])
  expect(h.request).not.toHaveBeenCalled()
})

it.each([
  { workerName: 'other-worker' },
  { accountId: 'b'.repeat(32) },
  { environment: 'missing' },
  { config: '../wrangler.jsonc' },
  { config: 'website/wrangler.toml' },
  { url: 'https://other.example.invalid' },
])('rejects a target inconsistent with the frozen configuration: %o', async (change) => {
  const h = await nativeFixture()
  h.site.stable = { ...target, ...change }
  const reason = 'config' in change ? change.config.endsWith('.toml') ? 'unsupported-config' : 'artifact-path-invalid' : 'url' in change ? 'provider-domain-mismatch' : 'environment' in change ? 'unsupported-config' : 'provider-identity-mismatch'
  await expectDocsFailure(deployDocs(h.options), 'preflight', reason)
  expect(h.calls).toEqual([])
})

it.each([
  { ...wrangler, main: 'worker.ts' },
  { ...wrangler, build: { command: 'generate' } },
  { ...wrangler, vars: { KEY: 'value' } },
  { ...wrangler, assets: { directory: 'dist', binding: 'ASSETS' } },
  { ...wrangler, assets: { directory: 'dist', html_handling: ['none'] } },
  { ...wrangler, assets: { directory: 'dist', not_found_handling: ['404-page'] } },
  { ...wrangler, routes: [{ pattern: '*.example.invalid/*', zone_name: 'example.invalid' }] },
  { ...wrangler, compatibility_date: '2026-99-99' },
  { ...wrangler, env: { next: { name: 'docs-next' } } },
  { ...wrangler, env: { next: { ...wrangler.env.next, assets: { not_found_handling: '404-page' } } } },
])('rejects unsupported or ambiguous static configuration before effects: %o', async (configuration) => {
  const h = await nativeFixture(configuration)
  const missingRoutes = 'env' in configuration && 'next' in configuration.env && Object.keys(configuration.env.next).length === 1
  await expectDocsFailure(deployDocs(h.options), 'preflight', missingRoutes ? 'environment-routes-missing' : 'unsupported-config')
  expect(h.calls).toEqual([])
})

it('applies the official inherited environment name and whole assets object', async () => {
  const h = await nativeFixture({ ...wrangler, env: { next: { routes: wrangler.env.next.routes } } })
  h.site.preview = { ...target, workerName: 'docs-stable-next', environment: 'next', url: 'https://next.example.invalid' }
  const options = { ...h.options, channel: 'preview' as const, sourceSha: h.sourceSha, release: undefined }
  h.callback.spawn = (args, _cwd, env) => {
    if (args[0] === 'exec') {
      writeFileSync(env['WRANGLER_OUTPUT_FILE_PATH']!, JSON.stringify({ type: 'deploy', version: 1, worker_name: 'docs-stable-next', wrangler_environment: 'next', version_id: h.state.versionId }))
    }
  }
  const { release: _release, ...preview } = options
  expect((await deployDocs(preview)).status).toBe('deployed')
  expect(h.calls[2]).toContain('next')
})

it('rejects two environment selectors addressing one physical Worker even with separate routes', async () => {
  const h = await nativeFixture({ ...wrangler, env: { next: { ...wrangler.env.next, name: wrangler.name } } })
  h.site.preview = { ...target, environment: 'next', url: 'https://next.example.invalid' }
  await expectDocsFailure(deployDocs(h.options), 'preflight', 'provider-target-shared')
  expect(h.calls).toEqual([])
})

it('rejects separate Workers declaring ownership of the same custom domain', async () => {
  const h = await nativeFixture({ ...wrangler, env: { next: { ...wrangler.env.next, routes: wrangler.routes } } })
  h.site.preview.url = target.url!
  await expectDocsFailure(deployDocs(h.options), 'preflight', 'provider-domain-shared')
  expect(h.calls).toEqual([])
})

it.each(['config', 'generated'])('revalidates %s after the build before upload', async (kind) => {
  const h = await nativeFixture()
  h.callback.spawn = (args, source) => {
    if (args[1] === 'docs:build') {
      const filename = kind === 'config' ? 'website/wrangler.jsonc' : 'website/.wrangler/deploy/config.json'
      if (kind === 'config') {
        writeFileSync(path.join(source, filename), `${JSON.stringify(wrangler)}\n\n`)
      }
      else {
        mkdirSync(path.dirname(path.join(source, filename)), { recursive: true })
        writeFileSync(path.join(source, filename), '{}')
      }
    }
  }
  await expectDocsFailure(deployDocs(h.options), 'provider', kind === 'config' ? 'provider-config-changed' : 'generated-config')
  expect(h.state.uploadCount).toBe(0)
  expect(h.store.records.get('docs/website/stable')!.value).not.toHaveProperty('pending')
})

it('rejects generated deployment redirection in an ancestor of a nested static config', async () => {
  const h = await nativeFixture()
  await put(h.cwd, 'website/nested/wrangler.jsonc', JSON.stringify({ ...wrangler, assets: { directory: '../dist' } }))
  await put(h.cwd, 'website/.wrangler/deploy/config.json', '{}')
  const record = makeRecord(commit(h.cwd))
  await h.store.github.writeAutomationState(`releases/${record.id}`, record)
  h.site.stable = { ...target, config: 'website/nested/wrangler.jsonc' }
  h.site.preview = { deployScript: 'docs:preview' }
  await expectDocsFailure(deployDocs({ ...h.options, release: record.id }), 'preflight', 'generated-config')
  expect(h.calls).toEqual([])
})
