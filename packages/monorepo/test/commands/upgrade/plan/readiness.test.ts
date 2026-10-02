import { expect, it, vi } from 'vitest'
import { planUpgrade } from '@/commands/upgrade/plan'
import { fixture, snapshot } from './fixture'

const prepare = vi.hoisted(() => vi.fn())
vi.mock('@icebreakers/monorepo-templates', async original => ({ ...await original<typeof import('@icebreakers/monorepo-templates')>(), areTemplateAssetsPrepared: async () => false, ensureTemplateAssetsPrepared: prepare }))

it('blocks a preview with unprepared assets without trying to generate assets or take a lock', async () => {
  const h = await fixture()
  const before = await snapshot(h.root)
  expect(await planUpgrade({ cwd: h.cwd })).toMatchObject({ status: 'blocked', files: [], blockers: [{ id: 'assets-not-prepared' }] })
  expect(prepare).not.toHaveBeenCalled()
  expect(await snapshot(h.root)).toEqual(before)
})
