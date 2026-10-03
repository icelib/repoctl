import { readFile, symlink } from 'node:fs/promises'
import { applyToolingCapability, listToolingCapabilities, planToolingCapability } from '@icebreakers/monorepo'
import path from 'pathe'
import { expect, it } from 'vitest'
import { fixture, options } from './fixture'

it('previews exact changes without writes, applies once, and preserves the application', async () => {
  const h = await fixture()
  const before = await h.snapshot()
  expect(listToolingCapabilities()).toMatchObject([{ id: 'playwright', version: 1 }])
  const plan = await planToolingCapability(h.root, options)
  expect(await h.snapshot()).toEqual(before)
  expect(plan.status).toBe('ready')
  expect(plan.dependencies).toContainEqual({ package: '@repoctl-e2e/web', name: 'web', version: 'workspace:*', kind: 'devDependencies' })
  expect(plan.files.find(file => file.path === 'package.json')?.diff).toContain('test:e2e')
  const result = await applyToolingCapability(plan)
  expect(result.status).toBe('applied')
  expect(await readFile(path.join(h.root, 'pnpm-workspace.yaml'), 'utf8')).toContain('# retained workspace comment')
  expect((await h.snapshot())['apps/web/business.ts']).toBe(before['apps/web/business.ts'])
  const applied = await h.snapshot()
  await expect(applyToolingCapability(plan)).resolves.toMatchObject({ status: 'unchanged' })
  expect((await planToolingCapability(h.root, options)).status).toBe('unchanged')
  expect(await h.snapshot()).toEqual(applied)
})

it('blocks existing generated files and custom root scripts without overwriting them', async () => {
  const h = await fixture()
  await h.write('e2e/web/playwright.config.ts', 'user configuration')
  await h.write('package.json', '{"private":true,"scripts":{"test:e2e":"user-test"},"devDependencies":{"turbo":"^2"}}')
  const before = await h.snapshot()
  const plan = await planToolingCapability(h.root, options)
  expect(plan.status).toBe('blocked')
  expect(plan.conflicts.map(item => item.path)).toEqual(expect.arrayContaining(['package.json', 'e2e/web/playwright.config.ts']))
  await expect(applyToolingCapability(plan)).rejects.toThrow('blocked')
  expect(await h.snapshot()).toEqual(before)
})

it('rejects stale targets, tampered plans and paths outside the workspace', async () => {
  const h = await fixture()
  const plan = await planToolingCapability(h.root, options)
  const tampered = structuredClone(plan)
  tampered.files[0]!.after += '\nmalicious change'
  await expect(applyToolingCapability(tampered)).rejects.toThrow('plan changed')
  await h.write('apps/web/package.json', '{"name":"web","private":true}')
  await expect(applyToolingCapability(plan)).rejects.toThrow('Unsupported E2E target')
  await expect(planToolingCapability(h.root, { ...options, directory: '../outside' })).rejects.toThrow()
})

it('keeps explicit workspace exclusions and rejects linked configuration', async () => {
  const h = await fixture()
  await h.write('pnpm-workspace.yaml', 'packages: [apps/*, "!e2e/**"]\n')
  expect((await planToolingCapability(h.root, options)).conflicts).toContainEqual(expect.objectContaining({ path: 'pnpm-workspace.yaml' }))
  await symlink(path.join(h.root, 'apps/web/business.ts'), path.join(h.root, 'linked.json'), 'file')
  await expect(planToolingCapability(h.root, { ...options, directory: 'linked.json' })).rejects.toThrow()
})

it('requires an explicit interaction and gives CI an independent non-reused server', async () => {
  const h = await fixture()
  const plan = await planToolingCapability(h.root, { ...options, reuseExistingServer: true })
  const config = plan.files.find(file => file.path.endsWith('playwright.config.ts'))!.after
  expect(config).toContain('reuseExistingServer: !process.env.CI && true')
  expect(config).toContain('headless: true')
  expect(config).toContain('--strictPort')
  expect(config).toContain('trace: \'retain-on-failure\'')
  await expect(planToolingCapability(h.root, { ...options, ciPort: 4173 })).rejects.toThrow('dedicated port')
  await expect(planToolingCapability(h.root, { ...options, interaction: { ...options.interaction, route: '//external.test' } })).rejects.toThrow('local absolute')
})

it('keeps unrelated files in an occupied destination and requires an empty initial workspace', async () => {
  const h = await fixture()
  await h.write('e2e/web/custom.spec.ts', 'team-owned test')
  const before = await h.snapshot()
  const plan = await planToolingCapability(h.root, options)
  expect(plan.conflicts).toContainEqual(expect.objectContaining({ id: 'occupied-directory', path: 'e2e/web' }))
  await expect(applyToolingCapability(plan)).rejects.toThrow('blocked')
  expect(await h.snapshot()).toEqual(before)
})
