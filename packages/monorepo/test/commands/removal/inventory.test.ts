import { access, mkdir, readFile, rm, stat, symlink, utimes, writeFile } from 'node:fs/promises'
import path from 'pathe'
import { expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist -- Verify the shipped public API.
import { applyWorkspaceRemovalPlan, planWorkspaceRemoval } from '../../../dist/index.mjs'
import { fixture, git, snapshot } from './fixture'

it('rejects modification-time drift even when Git reports unchanged content', async () => {
  const h = await fixture()
  const plan = await planWorkspaceRemoval(h.workspace, { target: 'old' })
  const file = path.join(h.workspace, 'packages/old/index.js')
  const original = await stat(file)
  await utimes(file, original.atime, new Date(original.mtimeMs + 10_000))
  expect(await git(h.workspace, ['status', '--porcelain'])).toBe('')
  const before = await snapshot(h.root)
  await expect(applyWorkspaceRemovalPlan(h.workspace, plan)).rejects.toThrow('stale')
  expect(await snapshot(h.root)).toEqual(before)
})

it('inventories link text without following destinations and rejects changed ignored links', async () => {
  const h = await fixture()
  const ignored = path.join(h.workspace, 'packages/old/ignored')
  await mkdir(ignored)
  await mkdir(path.join(h.home, 'first'))
  await mkdir(path.join(h.home, 'second'))
  await writeFile(path.join(h.home, 'first/keep'), 'external first')
  await writeFile(path.join(h.home, 'second/keep'), 'external second')
  const link = path.join(ignored, 'link')
  await symlink(path.join(h.home, 'first'), link, 'junction')
  const plan = await planWorkspaceRemoval(h.workspace, { target: 'old' })
  expect(plan.canApply).toBe(true)
  expect(plan.inventory).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'ignored/link', kind: 'symlink' })]))
  expect(plan.inventory.some(item => item.path === 'ignored/link/keep')).toBe(false)
  await rm(link)
  await symlink(path.join(h.home, 'second'), link, 'junction')
  expect(await git(h.workspace, ['status', '--porcelain'])).toBe('')
  await expect(applyWorkspaceRemovalPlan(h.workspace, plan)).rejects.toThrow('stale')
  await applyWorkspaceRemovalPlan(h.workspace, await planWorkspaceRemoval(h.workspace, { target: 'old' }))
  await expect(access(path.join(h.workspace, 'packages/old'))).rejects.toThrow()
  expect(await readFile(path.join(h.home, 'first/keep'), 'utf8')).toBe('external first')
  expect(await readFile(path.join(h.home, 'second/keep'), 'utf8')).toBe('external second')
})
