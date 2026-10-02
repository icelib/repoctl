import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from '@/utils/fs'

const applyUpgradeOperationsMock = vi.hoisted(() => vi.fn())
const prepareUpgradeMock = vi.hoisted(() => vi.fn())
const selectOperationsMock = vi.hoisted(() => vi.fn())

vi.mock('@icebreakers/monorepo-templates', async () => {
  const actual = await vi.importActual<typeof import('@icebreakers/monorepo-templates')>('@icebreakers/monorepo-templates')
  return {
    ...actual,
    ensureTemplateAssetsPrepared: vi.fn(async () => {}),
  }
})

vi.mock('@/commands/upgrade/files', () => ({
  applyUpgradeOperations: applyUpgradeOperationsMock,
}))

vi.mock('@/commands/upgrade/plan', () => ({
  prepareUpgrade: prepareUpgradeMock,
  resolveUpgradePlan: vi.fn(),
}))

vi.mock('@/commands/upgrade/selection', () => ({
  selectOperations: selectOperationsMock,
}))

const roots: string[] = []

afterEach(async () => {
  applyUpgradeOperationsMock.mockReset()
  prepareUpgradeMock.mockReset()
  selectOperationsMock.mockReset()
  vi.resetModules()
  await Promise.all(roots.splice(0).map(root => rm(root, { force: true, recursive: true })))
})

describe('upgrade workspace cache lifecycle', () => {
  it('clears cached package manifests when an upgrade fails', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'repoctl-upgrade-cache-'))
    roots.push(root)
    const packageDir = path.join(root, 'packages/demo')
    const packagePath = path.join(packageDir, 'package.json')
    await mkdir(packageDir, { recursive: true })
    await fs.outputJson(path.join(root, 'package.json'), { name: 'root', private: true })
    await writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
    await fs.outputJson(packagePath, { name: 'before-upgrade', version: '1.0.0' })

    prepareUpgradeMock.mockResolvedValue({
      plan: { targetDir: root, files: [] },
      operations: [],
    })
    selectOperationsMock.mockResolvedValue([])
    applyUpgradeOperationsMock.mockImplementation(async () => {
      await fs.outputJson(packagePath, { name: 'after-upgrade', version: '1.0.0' })
      throw new Error('simulated upgrade failure')
    })

    const { getWorkspacePackages } = await import('@/core/workspace')
    const { upgradeMonorepo } = await import('@/commands/upgrade')
    const before = await getWorkspacePackages(root, { ignoreRootPackage: false, ignorePrivatePackage: false })
    expect(before.map(pkg => pkg.manifest.name)).toEqual(['root', 'before-upgrade'])

    await expect(upgradeMonorepo({ cwd: root, yes: true })).rejects.toThrow('simulated upgrade failure')

    const after = await getWorkspacePackages(root, { ignoreRootPackage: false, ignorePrivatePackage: false })
    expect(after.map(pkg => pkg.manifest.name)).toEqual(['root', 'after-upgrade'])
    expect(JSON.parse(await readFile(packagePath, 'utf8')).name).toBe('after-upgrade')
  })
})
