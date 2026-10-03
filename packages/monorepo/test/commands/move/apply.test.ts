import { access, readFile, writeFile } from 'node:fs/promises'
import path from 'pathe'
import { expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist -- Verify the delivered API.
import { applyWorkspaceMovePlan, getWorkspaceGraph, planWorkspaceMove } from '../../../dist/index.mjs'
import { fixture, runCli, snapshot } from './fixture'

it.each([
  { to: 'libs/core' },
  { name: '@org/core' },
  { to: 'libs/core', name: '@org/core' },
])('applies only the reviewed move/rename and supports exact replay: %j', async (options) => {
  const h = await fixture({ 'packages/old': { version: '1.0.0' }, 'packages/app': { dependencies: { alias: 'workspace:old@*' } } })
  const plan = await planWorkspaceMove(h.workspace, { target: 'old', ...options })
  const result = await applyWorkspaceMovePlan(h.workspace, JSON.parse(JSON.stringify(plan)))
  expect(result.status).toBe('applied')
  expect(result.cleanupPending).toEqual([])
  expect(await readFile(path.join(h.workspace, options.to ?? 'packages/old', 'index.js'), 'utf8')).toBe('module.exports = 42\n')
  const graph = await getWorkspaceGraph(h.workspace)
  expect(graph.nodes).toContainEqual(expect.objectContaining({ id: options.to ?? 'packages/old', name: options.name ?? 'old' }))
  expect(graph.edges).toContainEqual(expect.objectContaining({ source: 'packages/app', target: options.to ?? 'packages/old' }))
  const after = await snapshot(h.workspace)
  expect((await applyWorkspaceMovePlan(h.workspace, plan)).status).toBe('unchanged')
  expect(await snapshot(h.workspace)).toEqual(after)
  if (options.to) {
    await expect(access(path.join(h.workspace, 'packages/old'))).rejects.toThrow()
  }
})

it('rejects stale source evidence and tampered plans without mutation', async () => {
  const h = await fixture()
  const plan = await planWorkspaceMove(h.workspace, { target: 'old', to: 'libs/core', name: 'core' })
  await writeFile(path.join(h.workspace, 'docs/guide.md'), 'new user documentation\n')
  const before = await snapshot(h.workspace)
  await expect(applyWorkspaceMovePlan(h.workspace, plan)).rejects.toThrow('stale')
  expect(await snapshot(h.workspace)).toEqual(before)
  await expect(applyWorkspaceMovePlan(h.workspace, { ...plan, destination: { id: '../outside' } })).rejects.toThrow('Invalid')
})

it('supports CLI JSON preview/apply from a saved plan and rejects mixed modes', async () => {
  const h = await fixture()
  const preview = runCli(h, ['old', '--to', 'libs/core', '--name', 'core', '--json'])
  expect(preview.status, preview.stderr).toBe(0)
  const plan = JSON.parse(preview.stdout)
  const file = path.join(h.root, 'move-plan.json')
  await writeFile(file, JSON.stringify(plan))
  const mixed = runCli(h, ['--apply', file, '--dry-run', '--json'])
  expect(mixed.status).not.toBe(0)
  expect(await readFile(path.join(h.workspace, 'packages/old/package.json'), 'utf8')).toContain('"old"')
  const applied = runCli(h, ['--apply', file, '--json'])
  expect(applied.status, applied.stderr).toBe(0)
  expect(JSON.parse(applied.stdout).moved).toEqual({ from: 'packages/old', to: 'libs/core' })
})
