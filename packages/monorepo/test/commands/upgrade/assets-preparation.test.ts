import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from '../../../src/utils/fs'

const ensureTemplateAssetsPreparedMock = vi.hoisted(() => vi.fn(async () => {}))

vi.mock('@icebreakers/monorepo-templates', async () => {
  const actual = await vi.importActual<typeof import('@icebreakers/monorepo-templates')>('@icebreakers/monorepo-templates')
  return {
    ...actual,
    ensureTemplateAssetsPrepared: ensureTemplateAssetsPreparedMock,
  }
})

const roots: string[] = []

afterEach(async () => {
  ensureTemplateAssetsPreparedMock.mockClear()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('upgrade plan asset preparation', () => {
  it('prepares managed assets before resolving a programmatic preview', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'repoctl-upgrade-assets-preparation-'))
    roots.push(cwd)
    await fs.outputJson(path.join(cwd, 'package.json'), { name: 'preview-workspace', private: true })
    await writeFile(path.join(cwd, 'pnpm-workspace.yaml'), 'packages: []\n')

    const { resolveUpgradePlan } = await import('@/commands/upgrade/plan')
    const plan = await resolveUpgradePlan({ cwd, yes: true })

    expect(plan.targetDir).toBe(cwd)
    expect(ensureTemplateAssetsPreparedMock).toHaveBeenCalledTimes(1)
  })
})
