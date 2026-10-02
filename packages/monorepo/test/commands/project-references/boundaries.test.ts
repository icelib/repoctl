import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist
import { applyProjectReferencesPlan, checkProjectReferences, planProjectReferences, syncProjectReferences } from '../../../dist/index.mjs'
import { bytes, fixture, settings, write } from './fixtures'

it.for([{ composite: false }, { declaration: false }, { noEmit: true }])('blocks incompatible inherited compiler options: %j', async (options, t) => {
  const root = await fixture(t)
  await write(root, 'base.json', { compilerOptions: { composite: true, declaration: true, ...options } })
  const before = await bytes(root, ['tsconfig.json', 'base.json'])
  const plan = await planProjectReferences(root)
  expect(plan.action).toBe('blocked')
  expect(plan.diagnostics.some(item => item.code === 'incompatible')).toBe(true)
  await expect(applyProjectReferencesPlan(plan)).rejects.toThrow('unresolved')
  expect(await bytes(root, ['tsconfig.json', 'base.json'])).toEqual(before)
})

it('detects cycles across manual and explicit compilation edges', async (t) => {
  const root = await fixture(t)
  await write(root, 'packages/lib/tsconfig.json', { extends: '../../base.json', references: [{ path: '../app' }], include: ['src'] })
  await settings(root, { enabled: true, relations: [{ source: 'packages/app/tsconfig.json', target: 'packages/lib/tsconfig.json' }] })
  expect((await planProjectReferences(root)).diagnostics).toContainEqual(expect.objectContaining({ code: 'cycle' }))
  await expect(syncProjectReferences(root)).rejects.toThrow('unresolved')
})

it('reports missing manual targets and explicit relations outside selected projects', async (t) => {
  const root = await fixture(t)
  await write(root, 'tsconfig.json', { files: [], references: [{ path: './missing' }] })
  await settings(root, { enabled: true, relations: [{ source: 'packages/app/tsconfig.json', target: 'packages/lib/tsconfig.other.json' }] })
  const plan = await planProjectReferences(root)
  expect(plan.diagnostics.map(item => item.code)).toEqual(expect.arrayContaining(['missing', 'unselected']))
})

it('rejects stale compiler configuration, discovery and policy inputs', async (t) => {
  const root = await fixture(t)
  const plan = await planProjectReferences(root)
  await write(root, 'base.json', { compilerOptions: { composite: true, declaration: true, strict: true } })
  await expect(applyProjectReferencesPlan(plan)).rejects.toThrow('stale')
  const fresh = await planProjectReferences(root)
  await write(root, 'packages/js/package.json', { name: 'js', private: true })
  await expect(applyProjectReferencesPlan(fresh)).rejects.toThrow('stale')
  const newer = await planProjectReferences(root)
  await settings(root, { enabled: true, exclude: ['packages/lib/tsconfig.json'] })
  await expect(applyProjectReferencesPlan(newer)).rejects.toThrow('stale')
})

it('preserves user edits to owned references and rejects forged plans', async (t) => {
  const root = await fixture(t)
  const plan = await planProjectReferences(root)
  const forged = structuredClone(plan)
  forged.operations.find(item => item.path === 'tsconfig.json')!.after = '{"files": []}\n'
  await expect(applyProjectReferencesPlan(forged)).rejects.toThrow('modified')
  await applyProjectReferencesPlan(plan)
  await write(root, 'tsconfig.json', { files: [], references: [{ path: './packages/lib/tsconfig.json', prepend: true }] })
  const before = await bytes(root, ['tsconfig.json', '.repoctl/typescript-references.json'])
  expect((await checkProjectReferences(root)).plan.diagnostics.some(item => item.code === 'ownership')).toBe(true)
  await expect(syncProjectReferences(root)).rejects.toThrow('unresolved')
  expect(await bytes(root, ['tsconfig.json', '.repoctl/typescript-references.json'])).toEqual(before)
})

it.for([null, { enabled: 'true' }, { projects: ['../outside'] }, { exclude: null }, { relations: [{ source: 'packages/app/tsconfig.json' }] }, { unexpected: true }])('rejects malformed settings: %j', async (value, t) => {
  const root = await fixture(t)
  await write(root, 'repoctl.config.mjs', `export default ${JSON.stringify({ tooling: { projectReferences: value } })}\n`)
  await expect(planProjectReferences(root)).rejects.toThrow()
})

it.runIf(process.platform !== 'win32')('rejects linked files and paths escaping the workspace', async (t) => {
  const root = await fixture(t)
  await fs.rename(path.join(root, 'tsconfig.json'), path.join(root, 'original.json'))
  await fs.symlink(path.join(root, 'original.json'), path.join(root, 'tsconfig.json'))
  await expect(planProjectReferences(root)).rejects.toThrow('Linked')
  await fs.unlink(path.join(root, 'tsconfig.json'))
  await write(root, 'tsconfig.json', { files: [], references: [{ path: '../../outside' }] })
  expect((await planProjectReferences(root)).diagnostics.some(item => item.code === 'config')).toBe(true)
})

it('reports duplicate JSONC reference fields and unmatched explicit project patterns', async (t) => {
  const root = await fixture(t)
  await write(root, 'tsconfig.json', '{"files": [], "references": [], "references": []}\n')
  await settings(root, { enabled: true, projects: ['packages/*/missing.json'] })
  const plan = await planProjectReferences(root)
  expect(plan.diagnostics).toContainEqual(expect.objectContaining({ code: 'config', path: 'tsconfig.json' }))
  expect(plan.diagnostics).toContainEqual(expect.objectContaining({ code: 'unselected', path: 'packages/*/missing.json' }))
  await expect(applyProjectReferencesPlan(plan)).rejects.toThrow('unresolved')
})

it('refreshes imported policy modules and respects a non-default solution config', async (t) => {
  const root = await fixture(t)
  await fs.rename(path.join(root, 'tsconfig.json'), path.join(root, 'tsconfig.build.json'))
  await write(root, 'policy.mjs', 'export default { enabled: true, root: "tsconfig.build.json" }\n')
  await write(root, 'repoctl.config.mjs', 'import policy from "./policy.mjs"\nexport default { tooling: { projectReferences: policy } }\n')
  const first = await planProjectReferences(root)
  expect(first.root).toBe('tsconfig.build.json')
  await write(root, 'policy.mjs', 'export default { enabled: true, root: "tsconfig.build.json", exclude: ["packages/lib/tsconfig.json"] }\n')
  await expect(applyProjectReferencesPlan(first)).rejects.toThrow('stale')
  const next = await planProjectReferences(root)
  expect(next.projects).toEqual(['packages/app/tsconfig.json'])
  await applyProjectReferencesPlan(next)
  await expect(fs.stat(path.join(root, 'tsconfig.json'))).rejects.toThrow()
})
