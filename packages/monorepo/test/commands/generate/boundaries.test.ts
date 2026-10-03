import { mkdir, readFile, symlink } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist
import { applyGeneratePlan, planGenerate } from '../../../dist/index.mjs'
import { fixture, write } from './fixtures'

const base = { package: 'packages/react', generator: 'react-component' as const, parameters: { name: 'card', export: true } }

it.for(['../outside', '/absolute', 'src/../outside', 'src\\outside', 'src/CON', 'node_modules/generated', 'src/with:colon'])('rejects nonportable output directory %s', async (directory, t) => {
  await expect(planGenerate({ ...base, cwd: await fixture(t), directory })).rejects.toThrow('package-relative')
})

it('refuses source directories linked outside the selected package', async (t) => {
  const root = await fixture(t)
  await mkdir(path.join(root, 'outside'))
  await symlink(path.join(root, 'outside'), path.join(root, 'packages/react/src/components'), process.platform === 'win32' ? 'junction' : 'dir')
  await expect(planGenerate({ ...base, cwd: root })).rejects.toThrow('Linked or unsupported')
})

it('rejects stale manifests and tampered plan bytes before creating any output', async (t) => {
  const root = await fixture(t)
  const plan = await planGenerate({ ...base, cwd: root })
  const tampered = structuredClone(plan)
  tampered.files[0]!.after = 'unreviewed source'
  await expect(applyGeneratePlan(tampered)).rejects.toThrow('stale or modified')
  await write(root, 'packages/react/package.json', { name: '@fixture/react', private: true, dependencies: { react: '^19.0.0' } })
  await expect(applyGeneratePlan(plan)).rejects.toThrow('stale or modified')
  expect(await readFile(path.join(root, 'packages/react/src/index.ts'), 'utf8')).toContain('existing = 42')
})

it('keeps another writer lock and its files untouched', async (t) => {
  const root = await fixture(t)
  const plan = await planGenerate({ ...base, cwd: root })
  await write(root, 'packages/react/.repoctl/generate.lock', 'another writer\n')
  await expect(applyGeneratePlan(plan)).rejects.toThrow('locked')
  expect(await readFile(path.join(root, 'packages/react/.repoctl/generate.lock'), 'utf8')).toBe('another writer\n')
})
