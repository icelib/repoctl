import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import path from 'pathe'
import { expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist -- Verify the delivered API.
import { planWorkspaceMove } from '../../../dist/index.mjs'
import { commit, fixture, snapshot, writeJson } from './fixture'

it('previews direct, aliased and relative dependencies without changing any file', async () => {
  const h = await fixture({
    '.': { dependencies: { old: 'workspace:*' } },
    'packages/old': { version: '1.0.0', private: false, repository: { type: 'git', url: 'https://example.invalid/repo', directory: 'packages/old' }, dependencies: { helper: 'link:../helper' } },
    'packages/helper': {},
    'packages/app': { dependencies: { old: 'workspace:^', alias: 'workspace:old@*', linked: 'link:../old' }, devDependencies: { old: '^1.0.0' }, peerDependencies: { old: '*' }, optionalDependencies: { old: 'workspace:*' }, peerDependenciesMeta: { old: { optional: true } }, dependenciesMeta: { old: { injected: true } }, scripts: { build: 'echo old' } },
  })
  const before = await snapshot(h.workspace)
  const plan = await planWorkspaceMove(h.workspace, { target: 'old', to: 'libs/core', name: '@org/core' })
  expect(plan.canApply).toBe(true)
  expect(plan.consumers.map(item => item.id)).toEqual(['.', 'packages/app'])
  const app = JSON.parse(plan.files.find(file => file.path === 'packages/app/package.json')!.after)
  expect(app.dependencies).toEqual({ '@org/core': 'workspace:^', 'alias': 'workspace:@org/core@*', 'linked': 'link:../../libs/core' })
  for (const section of ['devDependencies', 'peerDependencies', 'optionalDependencies', 'peerDependenciesMeta', 'dependenciesMeta']) {
    expect(Object.keys(app[section])).toEqual(['@org/core'])
  }
  expect(app.scripts).toEqual({ build: 'echo old' })
  const selected = JSON.parse(plan.files.find(file => file.path === 'packages/old/package.json')!.after)
  expect(selected).toMatchObject({ name: '@org/core', repository: { directory: 'libs/core' }, dependencies: { helper: 'link:../../packages/helper' } })
  expect(plan.nextSteps.join('\n')).toContain('new npm package identity')
  expect(await snapshot(h.workspace)).toEqual(before)
})

it('updates explicit TypeScript paths and references, preserves comments, and locates source review tasks', async () => {
  const h = await fixture({ 'packages/old': {}, 'packages/app': { dependencies: { old: 'workspace:*' } } })
  await writeFile(path.join(h.workspace, 'tsconfig.json'), '// user comment\n{"compilerOptions":{"baseUrl":".","paths":{"old":["packages/old/index.js"],"old/*":["packages/old/*"]}},"references":[{"path":"packages/old"}]}\n')
  await writeJson(path.join(h.workspace, 'packages/old/tsconfig.json'), { extends: '../../tsconfig.json', compilerOptions: { outDir: '../../build/old' }, include: ['./*.ts'] })
  await writeFile(path.join(h.workspace, 'packages/app/index.js'), 'const api = require("old")\nconst file = "../old/index.js"\n')
  await commit(h.workspace)
  const plan = await planWorkspaceMove(h.workspace, { target: 'old', to: 'libs/nested/core', name: '@org/core' })
  const config = plan.files.find(file => file.path === 'tsconfig.json')!
  expect(config.after).toContain('// user comment')
  expect(config.after).toContain('libs/nested/core/index.js')
  expect(config.after).toContain('"@org/core/*"')
  const local = plan.files.find(file => file.path === 'packages/old/tsconfig.json')!
  expect(JSON.parse(local.after)).toMatchObject({ extends: '../../../tsconfig.json', compilerOptions: { outDir: '../../../build/old' }, include: ['./*.ts'] })
  expect(plan.review.tasks).toEqual(expect.arrayContaining([
    expect.objectContaining({ path: 'packages/app/index.js', line: 1 }),
    expect.objectContaining({ path: 'packages/app/index.js', line: 2 }),
  ]))
  expect(await readFile(path.join(h.workspace, 'packages/app/index.js'), 'utf8')).toContain('require("old")')
})

it('blocks dirty target and dirty consumer manifests before writes', async () => {
  const h = await fixture({ 'packages/old': {}, 'packages/app': { dependencies: { old: 'workspace:*' } } })
  await writeFile(path.join(h.workspace, 'packages/old/index.js'), 'concurrent source\n')
  await writeJson(path.join(h.workspace, 'packages/app/package.json'), { name: 'app', dependencies: { old: 'workspace:*' }, description: 'local edit' })
  const plan = await planWorkspaceMove(h.workspace, { target: 'old', name: 'new' })
  expect(plan.canApply).toBe(false)
  expect(plan.blockers.map(item => item.code)).toEqual(expect.arrayContaining(['dirty_target', 'dirty_inputs']))
})

it.each(['../outside', '/tmp/external', '.git/new', 'node_modules/new', 'packages/old/nested', 'packages/app/nested'])('rejects unsafe destination %s', async (to) => {
  const h = await fixture({ 'packages/old': {}, 'packages/app': {} })
  await expect(planWorkspaceMove(h.workspace, { target: 'old', to })).rejects.toThrow()
})

it('rejects occupied paths, duplicate names, invalid scope names, exclusions and symbolic-link parents', async () => {
  const h = await fixture({ 'packages/old': {}, 'packages/app': {} })
  await mkdir(path.join(h.workspace, 'packages/existing'))
  await expect(planWorkspaceMove(h.workspace, { target: 'old', to: 'packages/existing' })).rejects.toThrow('already exists')
  await expect(planWorkspaceMove(h.workspace, { target: 'old', name: 'app' })).rejects.toThrow('already uses')
  await expect(planWorkspaceMove(h.workspace, { target: 'old', name: '@Scope/pkg' })).rejects.toThrow('valid')
  await writeFile(path.join(h.workspace, 'pnpm-workspace.yaml'), 'packages: [packages/*, "!libs/**"]\n')
  await expect(planWorkspaceMove(h.workspace, { target: 'old', to: 'libs/new' })).rejects.toThrow('excluded')
  await symlink(h.home, path.join(h.workspace, 'linked'), 'dir')
  await expect(planWorkspaceMove(h.workspace, { target: 'old', to: 'linked/new' })).rejects.toThrow()
})

it('refuses a dependency or TypeScript alias collision', async () => {
  const h = await fixture({ 'packages/old': {}, 'packages/app': { dependencies: { old: 'workspace:*', renamed: '^3.0.0' } } })
  await expect(planWorkspaceMove(h.workspace, { target: 'old', name: 'renamed' })).rejects.toThrow('overwrite')
  await writeJson(path.join(h.workspace, 'tsconfig.json'), { compilerOptions: { paths: { old: ['./packages/old'], other: ['./other'] } } })
  await commit(h.workspace)
  await expect(planWorkspaceMove(h.workspace, { target: 'old', name: 'other' })).rejects.toThrow('alias already exists')
})

it('uses the Git root for repository.directory in a nested workspace', async () => {
  const h = await fixture({ 'packages/old': { repository: { type: 'git', url: 'https://example.invalid/repo', directory: 'workspace/packages/old' } } }, { nested: true })
  const plan = await planWorkspaceMove(h.workspace, { target: 'old', to: 'libs/core' })
  const manifest = JSON.parse(plan.files.find(file => file.path === 'packages/old/package.json')!.after)
  expect(manifest.repository.directory).toBe('workspace/libs/core')
})

it('keeps inherited TypeScript aliases untouched and reports their new location', async () => {
  const h = await fixture()
  await writeJson(path.join(h.workspace, 'packages/old/tsconfig.json'), { extends: '../../base.json', compilerOptions: { paths: { old: ['./index.ts'] } } })
  await commit(h.workspace)
  const plan = await planWorkspaceMove(h.workspace, { target: 'old', to: 'libs/nested/core', name: 'core' })
  const config = JSON.parse(plan.files.find(file => file.path === 'packages/old/tsconfig.json')!.after)
  expect(config.compilerOptions.paths).toEqual({ old: ['./index.ts'] })
  expect(plan.review.tasks).toContainEqual(expect.objectContaining({ path: 'libs/nested/core/tsconfig.json', reason: expect.stringContaining('Inherited TypeScript baseUrl') }))
})

it('locates broader TypeScript globs whose coverage may change across workspace folders', async () => {
  const h = await fixture()
  await writeJson(path.join(h.workspace, 'tsconfig.json'), { include: ['packages/*/index.ts'], exclude: ['packages/*/dist/**'] })
  await commit(h.workspace)
  const plan = await planWorkspaceMove(h.workspace, { target: 'old', to: 'libs/core' })
  expect(plan.files.some(file => file.path === 'tsconfig.json')).toBe(false)
  expect(plan.review.tasks).toEqual(expect.arrayContaining([
    expect.objectContaining({ path: 'tsconfig.json', line: 2, reason: expect.stringContaining('include glob coverage') }),
    expect.objectContaining({ path: 'tsconfig.json', line: 5, reason: expect.stringContaining('exclude glob coverage') }),
  ]))
})
