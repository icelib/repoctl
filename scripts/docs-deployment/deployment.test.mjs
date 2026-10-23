/* eslint test/no-import-node-test: off -- This source-site integration runs with node --test after the published CLI build. */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { loadMonorepoConfig } from 'repoctl'

const root = fileURLToPath(new URL('../../', import.meta.url))

it('the source site targets distinct static Workers with matching account, names and custom domains', async () => {
  const { commands: { docs } } = await loadMonorepoConfig(root)
  const workers = new Set()
  for (const target of [docs.sites.website.preview, docs.sites.website.stable]) {
    assert.equal(target.provider, 'cloudflare-workers')
    const wrangler = JSON.parse(await readFile(path.join(root, target.config), 'utf8'))
    const environment = target.environment ? wrangler.env[target.environment] : wrangler
    assert.equal(environment.name, target.workerName)
    const configuredAccount = environment.account_id ?? wrangler.account_id
    if (configuredAccount !== undefined) {
      assert.equal(configuredAccount, target.accountId)
    }
    assert.equal(environment.workers_dev ?? wrangler.workers_dev, false)
    assert.equal(environment.preview_urls ?? wrangler.preview_urls, false)
    assert.ok((environment.assets ?? wrangler.assets).directory)
    assert.equal(environment.main ?? wrangler.main, undefined)
    const origin = new URL(target.url)
    assert.equal(origin.protocol, 'https:')
    assert.ok(environment.routes.some(route => route.custom_domain && route.pattern === origin.hostname))
    workers.add(`${target.accountId}/${target.workerName}`)
  }
  assert.equal(workers.size, 2)
})
