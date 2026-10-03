import type { StorybookCapabilityOptions } from '@icebreakers/monorepo'
import { readFile } from 'node:fs/promises'
import { applyToolingCapability, planToolingCapability } from '@icebreakers/monorepo'
import path from 'pathe'
import { expect, it } from 'vitest'
import { fixture, options as playwrightOptions } from './fixture'

const vue: StorybookCapabilityOptions = { capability: 'storybook', target: 'web', framework: 'vue', component: 'HelloWorld', example: { kind: 'prop-update', prop: 'msg', initial: 'Hello', updated: 'Updated' } }
const manifest = { name: 'web', type: 'module', exports: { '.': './dist/index.js' }, scripts: { build: 'vite build', test: 'vitest run' }, devDependencies: { vue: '^3.5.43' } }

it('adds optional Vue stories without changing library scripts, exports, files or dependencies', async () => {
  const h = await fixture()
  await h.write('apps/web/package.json', JSON.stringify(manifest))
  const before = await h.snapshot()
  const plan = await planToolingCapability(h.root, vue)
  expect(plan.capability.id).toBe('storybook')
  expect(plan.status).toBe('ready')
  expect(plan.workspace.directory).toBe('stories/web')
  expect(await h.snapshot()).toEqual(before)
  expect(plan.files.every(file => !file.path.startsWith('apps/web/'))).toBe(true)
  await expect(applyToolingCapability(plan)).resolves.toMatchObject({ status: 'applied' })
  expect((await h.snapshot())['apps/web/package.json']).toBe(before['apps/web/package.json'])
  await h.write('stories/web/stories/owned.stories.ts', 'export const TeamStory = {}\n')
  await expect(applyToolingCapability(plan)).resolves.toMatchObject({ status: 'unchanged' })
  expect(await readFile(path.join(h.root, 'stories/web/stories/owned.stories.ts'), 'utf8')).toContain('TeamStory')
})

it('generates actual React click assertions with distinct example states', async () => {
  const h = await fixture()
  await h.write('apps/web/package.json', JSON.stringify({ ...manifest, devDependencies: { react: '^19.3.0' } }))
  const options: StorybookCapabilityOptions = { ...vue, framework: 'react', component: 'Counter', example: { kind: 'click', args: { initialCount: 0 }, alternateArgs: { initialCount: 4 }, click: { role: 'button', name: 'Increase' }, expectText: '1' } }
  const plan = await planToolingCapability(h.root, options)
  expect(plan.dependencies).toContainEqual(expect.objectContaining({ name: '@storybook/react-vite' }))
  const story = plan.files.find(file => file.path.endsWith('.stories.tsx'))!.after
  expect(story).toContain('import { Counter as TargetComponent } from \'web\'')
  expect(story).toContain('getByRole(\'button\', { name: \'Increase\' })')
  expect(story).toContain('getByText(\'1\', { exact: true })')
  expect(plan.files.find(file => file.path === 'turbo.json')!.after).toContain('storybook-static/**')
})

it('preserves modified stories, rejects stale inputs, and never absorbs existing configuration', async () => {
  const h = await fixture()
  await h.write('apps/web/package.json', JSON.stringify(manifest))
  const plan = await planToolingCapability(h.root, vue)
  await applyToolingCapability(plan)
  await h.write('stories/web/.storybook/main.ts', 'team config\n')
  const before = await h.snapshot()
  const blocked = await planToolingCapability(h.root, vue)
  expect(blocked.status).toBe('blocked')
  await expect(applyToolingCapability(blocked)).rejects.toThrow('blocked')
  await expect(applyToolingCapability(plan)).rejects.toThrow('plan changed')
  expect(await h.snapshot()).toEqual(before)
})

it.each(['>=18.2.0 <19', '18', '^18.3.0'])('aligns generated React type packages with the supported range %s', async (react) => {
  const h = await fixture()
  await h.write('apps/web/package.json', JSON.stringify({ ...manifest, devDependencies: { react } }))
  const plan = await planToolingCapability(h.root, { ...vue, framework: 'react' })
  expect(plan.dependencies).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'react', version: react }),
    expect.objectContaining({ name: '@types/react', version: '^18.3.0' }),
    expect.objectContaining({ name: '@types/react-dom', version: '^18.3.0' }),
  ]))
})

it('coexists with Playwright root tasks and protects excluded directories and unsupported targets', async () => {
  const h = await fixture()
  await applyToolingCapability(await planToolingCapability(h.root, playwrightOptions))
  await h.write('apps/web/package.json', JSON.stringify(manifest))
  const plan = await planToolingCapability(h.root, vue)
  expect(plan.status).toBe('ready')
  await applyToolingCapability(plan)
  const root = JSON.parse(await readFile(path.join(h.root, 'package.json'), 'utf8'))
  expect(root.scripts).toMatchObject({ 'test:e2e': 'turbo run test:e2e', 'test:storybook': 'turbo run test:storybook' })
  await h.write('pnpm-workspace.yaml', 'packages: [apps/*, "!stories/**"]\n')
  expect((await planToolingCapability(h.root, vue)).status).toBe('blocked')
  await expect(planToolingCapability(h.root, { ...vue, directory: 'apps/web/docs' })).rejects.toThrow('separate')
  await expect(planToolingCapability(h.root, { ...vue, framework: 'react' })).rejects.toThrow('Unsupported Storybook target')
  await expect(planToolingCapability(h.root, { ...vue, component: 'default' })).rejects.toThrow('named JavaScript identifier')
})
