import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import process from 'node:process'
import { deployDocs } from '@icebreakers/monorepo'
import path from 'pathe'
import { afterEach, expect, it } from 'vitest'
import { cleanup, put } from '../helpers'
import { accountId, nativeFixture } from './helpers'

afterEach(cleanup)

it.each(['preview', 'stable'] as const)('preserves the %s Worker identity through the real installed Wrangler CLI', async (channel) => {
  const h = await nativeFixture()
  h.options.env = { ...h.options.env, CLOUDFLARE_API_KEY: '', CF_API_KEY: '' }
  const original = { ...h.options.env }
  let uploadedEnvironment: NodeJS.ProcessEnv | undefined
  h.callback.spawn = (args, _cwd, env) => {
    if (args[0] === 'exec') {
      uploadedEnvironment = { ...env }
    }
  }
  const { release, ...options } = h.options
  await deployDocs({
    ...options,
    channel,
    ...(channel === 'preview' ? { sourceSha: h.sourceSha } : { release: release! }),
    env: { ...options.env, REPO_DOCS_CONCURRENCY_GROUP: `docs-website-${channel}` },
  })
  expect(h.options.env).toEqual(original)
  expect(uploadedEnvironment).toMatchObject({ CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_BASE_URL: 'https://api.cloudflare.com/client/v4', CLOUDFLARE_API_TOKEN: 'secret-token' })
  for (const key of ['WRANGLER_CI_OVERRIDE_NAME', 'CLOUDFLARE_API_KEY', 'CF_API_KEY']) {
    expect(uploadedEnvironment).not.toHaveProperty(key)
  }
  await put(h.cwd, 'website/dist/index.html', '<h1>Offline documentation deployment</h1>')
  // Wrangler writes a device ID even with telemetry disabled; isolate both legacy and XDG config paths.
  await put(h.cwd, 'wrangler-profile/.wrangler/.keep', '')
  await put(h.cwd, 'wrangler-profile.cjs', 'require("node:os").homedir = () => require("node:path").join(__dirname, "wrangler-profile"); require("node:module").syncBuiltinESMExports();\n')
  const require = createRequire(new URL('../../../../../../templates/vitepress/package.json', import.meta.url))
  const manifest = require.resolve('wrangler/package.json')
  const binary = path.resolve(path.dirname(manifest), JSON.parse(readFileSync(manifest, 'utf8')).bin.wrangler)
  const args = ['--require', path.join(h.cwd, 'wrangler-profile.cjs'), binary, 'deploy', '--dry-run', '--config', path.join(h.cwd, 'website/wrangler.jsonc'), '--env', channel === 'preview' ? 'next' : '']
  const env = { ...uploadedEnvironment, XDG_CONFIG_HOME: path.join(h.cwd, 'xdg-config'), WRANGLER_SEND_METRICS: 'false', WRANGLER_SEND_ERROR_REPORTS: 'false', WRANGLER_OUTPUT_FILE_PATH: path.join(h.cwd, 'dry-run.jsonl'), WRANGLER_LOG_PATH: path.join(h.cwd, 'logs') }
  const result = spawnSync(process.execPath, args, { cwd: h.cwd, env, encoding: 'utf8', timeout: 30_000, windowsHide: true })
  expect(result.error).toBeUndefined()
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
  expect(`${result.stdout}\n${result.stderr}`).not.toMatch(/Failed to match Worker name|You need to provide the name/)
  expect(existsSync(path.join(h.cwd, 'wrangler-profile/.wrangler/metrics.json'))).toBe(true)
  const broken = spawnSync(process.execPath, args, { cwd: h.cwd, env: { ...env, WRANGLER_CI_OVERRIDE_NAME: '' }, encoding: 'utf8', timeout: 30_000, windowsHide: true })
  expect(broken.error).toBeUndefined()
  expect(broken.status).not.toBe(0)
  expect(`${broken.stdout}\n${broken.stderr}`).toContain('You need to provide the name of your worker')
}, 90_000)
