import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist
import { applyTemplateLinkPlan, applyTemplateUpgradePlan, listTemplateInstances, planTemplateLink, planTemplateUpgrade } from '../../../../dist/index.mjs'
import { contents, originalCode, upgradeFixture, write } from './fixtures'

it('preserves deleted files and whole directories, including new upstream descendants', async (t) => {
  const f = await upgradeFixture(t)
  await fs.rm(path.join(f.targetDir, 'README.md'))
  await fs.rm(path.join(f.targetDir, 'src'), { recursive: true })
  await write(f.nextSource, 'templates/tsdown/README.md', 'Updated upstream\n')
  await write(f.nextSource, 'templates/tsdown/src/nested/added.ts', 'export const added = true\n')
  const plan = await planTemplateUpgrade(f.options)
  expect(plan.action).toBe('upgrade')
  expect(plan.changes.find(item => item.path === 'src/nested/added.ts')?.reason).toBe('user-deletion-preserved')
  await applyTemplateUpgradePlan(plan)
  await expect(fs.stat(path.join(f.targetDir, 'README.md'))).rejects.toThrow()
  await expect(fs.stat(path.join(f.targetDir, 'src'))).rejects.toThrow()
})

it('persists canonical unmanaged paths through further upgrades', async (t) => {
  const f = await upgradeFixture(t)
  await write(f.targetDir, 'src/index.ts', 'Business-owned file\n')
  await write(f.nextSource, 'templates/tsdown/src/index.ts', 'Upstream-owned file\n')
  await write(f.nextSource, 'templates/tsdown/src/new.ts', 'New upstream file\n')
  const plan = await planTemplateUpgrade({ ...f.options, exclude: ['src/**', 'src/index.ts', 'src'] })
  expect(plan.nextInstance.excludedPaths).toEqual(['src'])
  expect(plan.action).toBe('upgrade')
  await applyTemplateUpgradePlan(plan)
  expect(await fs.readFile(path.join(f.targetDir, 'src/index.ts'), 'utf8')).toBe('Business-owned file\n')
  await expect(fs.stat(path.join(f.targetDir, 'src/new.ts'))).rejects.toThrow()
  await write(f.nextSource, 'package.json', '{"name":"@icebreakers/monorepo-templates","version":"3.0.0"}\n')
  await write(f.nextSource, 'templates/tsdown/src/index.ts', 'Another upstream version\n')
  await applyTemplateUpgradePlan(await planTemplateUpgrade({ ...f.options, version: '3.0.0' }))
  expect((await listTemplateInstances(f.cwd))[0]!.instance.excludedPaths).toEqual(['src'])
  const linked = await planTemplateLink({ cwd: f.cwd, target: f.target, template: 'tsdown', version: '3.0.0', sourceDir: f.nextSource, profile: 'workspace-copy-v1' })
  expect(linked.action).toBe('unchanged')
  await applyTemplateLinkPlan(linked)
  expect(await fs.readFile(path.join(f.targetDir, 'src/index.ts'), 'utf8')).toBe('Business-owned file\n')
  for (const exclude of ['../outside', '/absolute', 'src/*.ts', 'src/../README.md']) {
    await expect(planTemplateUpgrade({ ...f.options, version: '3.0.0', exclude: [exclude] })).rejects.toThrow()
  }
})

it('removes unchanged upstream-deleted files but preserves business descendants', async (t) => {
  const f = await upgradeFixture(t)
  await write(f.targetDir, 'src/business.ts', 'Business addition\n')
  await fs.rm(path.join(f.nextSource, 'templates/tsdown/src'), { recursive: true })
  await applyTemplateUpgradePlan(await planTemplateUpgrade(f.options))
  await expect(fs.stat(path.join(f.targetDir, 'src/index.ts'))).rejects.toThrow()
  expect(await fs.readFile(path.join(f.targetDir, 'src/business.ts'), 'utf8')).toBe('Business addition\n')
})

it('reports upstream deletions of locally modified files as conflicts', async (t) => {
  const f = await upgradeFixture(t)
  await write(f.targetDir, 'README.md', 'Business readme\n')
  await fs.rm(path.join(f.nextSource, 'templates/tsdown/README.md'))
  const before = await contents(f.cwd)
  const plan = await planTemplateUpgrade(f.options)
  expect(plan.changes.find(item => item.path === 'README.md')?.reason).toBe('upstream-removal-conflict')
  await expect(applyTemplateUpgradePlan(plan)).rejects.toThrow('unresolved conflicts')
  expect(await contents(f.cwd)).toEqual(before)
})

it('rejects binary conflicts, additions over business files and file/directory changes', async (t) => {
  const f = await upgradeFixture(t, originalCode, async source => await fs.writeFile(path.join(source, 'templates/tsdown/asset.bin'), Buffer.from([0, 1, 2])))
  await fs.writeFile(path.join(f.targetDir, 'asset.bin'), Buffer.from([0, 3, 2]))
  await fs.writeFile(path.join(f.nextSource, 'templates/tsdown/asset.bin'), Buffer.from([0, 1, 4]))
  await write(f.targetDir, 'collision.txt', 'Business file\n')
  await write(f.nextSource, 'templates/tsdown/collision.txt', 'Upstream addition\n')
  await fs.rm(path.join(f.nextSource, 'templates/tsdown/src'), { recursive: true })
  await write(f.nextSource, 'templates/tsdown/src', 'Now a file\n')
  const plan = await planTemplateUpgrade(f.options)
  expect(plan.changes.find(item => item.path === 'asset.bin')?.status).toBe('conflict')
  expect(plan.changes.find(item => item.path === 'collision.txt')?.reason).toBe('upstream-addition-collision')
  expect(plan.changes.find(item => item.path === 'src')?.reason).toBe('entry-type-conflict')
})

it.skipIf(process.platform === 'win32')('applies upstream executable changes while preserving custom permission bits', async (t) => {
  const f = await upgradeFixture(t)
  await fs.chmod(path.join(f.targetDir, 'src/index.ts'), 0o640)
  await fs.chmod(path.join(f.nextSource, 'templates/tsdown/src/index.ts'), 0o755)
  await applyTemplateUpgradePlan(await planTemplateUpgrade(f.options))
  expect((await fs.stat(path.join(f.targetDir, 'src/index.ts'))).mode & 0o777).toBe(0o750)
})

it.skipIf(process.platform === 'win32')('does not scan unrelated business trees or read explicitly unmanaged paths', async (t) => {
  const f = await upgradeFixture(t)
  const unrelated = path.join(f.targetDir, 'business-data.bin')
  const handle = await fs.open(unrelated, 'w')
  await handle.truncate(40 * 1024 * 1024)
  await handle.close()
  await fs.symlink(f.root, path.join(f.targetDir, 'business-link'))
  await fs.unlink(path.join(f.targetDir, 'README.md'))
  await fs.symlink(path.join(f.sourceDir, 'package.json'), path.join(f.targetDir, 'README.md'))
  await write(f.nextSource, 'templates/tsdown/src/index.ts', originalCode.replace('first = 1', 'first = 2'))
  const plan = await planTemplateUpgrade({ ...f.options, exclude: ['README.md'] })
  expect(plan.action).toBe('upgrade')
  expect(plan.changes.find(item => item.path === 'README.md')).toMatchObject({ status: 'preserved', reason: 'excluded-path', before: null, after: null })
  expect(JSON.stringify(plan)).not.toContain('business-data')
  await applyTemplateUpgradePlan(plan)
  expect((await fs.stat(unrelated)).size).toBe(40 * 1024 * 1024)
  expect((await fs.lstat(path.join(f.targetDir, 'README.md'))).isSymbolicLink()).toBe(true)
})
