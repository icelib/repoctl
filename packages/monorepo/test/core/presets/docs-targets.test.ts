import type { DocsDeploymentTarget, DocsSiteConfig } from '@icebreakers/monorepo'
import { expect, it } from 'vitest'
import { fixture, loadRepo, manifest } from './fixture'

const script: DocsDeploymentTarget = { deployScript: 'docs:deploy', url: 'https://docs.example.invalid' }
const native: DocsDeploymentTarget = { provider: 'cloudflare-workers', config: 'website/wrangler.jsonc', workerName: 'docs', accountId: 'a'.repeat(32) }
const site = (target: DocsDeploymentTarget): DocsSiteConfig => ({ packages: ['core'], buildScript: 'docs:build', preview: target, stable: target, patchPaths: ['website/**'] })

it.each([[script, native], [native, script]])('replaces the full provider contract when a project switches a preset target', async (before, after) => {
  const repo = await loadRepo()
  const h = await fixture()
  const ref = await h.install('@team/docs', { ...manifest, config: { commands: { docs: { sites: { website: site(before) } } } } })
  await h.config({ presets: [ref], commands: { docs: { sites: { website: site(after) } } } })
  const loaded = await repo.loadMonorepoConfigDetails(h.root, { refresh: true })
  expect(loaded.config.commands?.docs?.sites?.['website']?.stable).toEqual(after)
  const explained = await repo.explainMonorepoConfig(h.root, { command: 'docs' })
  expect(explained.effective?.values).toMatchObject({ sites: { website: { stable: after } } })
  expect(explained.effective?.sources['sites.website.stable.url']).toEqual(after.url ? expect.objectContaining({ kind: 'project' }) : undefined)
})

it('preserves same-script merging and old serialization without injecting provider defaults', async () => {
  const repo = await loadRepo()
  const h = await fixture()
  const ref = await h.install('@team/docs', { ...manifest, config: { commands: { docs: { sites: { website: site(script) } } } } })
  await h.config({ presets: [ref], commands: { docs: { sites: { website: site({ deployScript: 'docs:project' }) } } } })
  const loaded = await repo.loadMonorepoConfigDetails(h.root, { refresh: true })
  const target = loaded.config.commands?.docs?.sites?.['website']?.stable
  expect(JSON.stringify(target)).toBe(JSON.stringify({ deployScript: 'docs:project', url: script.url }))
  expect(target).not.toHaveProperty('provider')
})

it.each([[script, native], [native, script]])('supports provider switching through project extends before preset merging', async (before, after) => {
  const repo = await loadRepo()
  const h = await fixture()
  await h.write('base.config.mjs', `export default ${JSON.stringify({ commands: { docs: { sites: { website: site(before) } } } })}`)
  await h.write('repoctl.config.mjs', `export default ${JSON.stringify({ extends: ['./base.config.mjs'], commands: { docs: { sites: { website: site(after) } } } })}`)
  const loaded = await repo.loadMonorepoConfigDetails(h.root, { refresh: true })
  expect(loaded.config.commands?.docs?.sites?.['website']?.stable).toEqual(after)
})
