import { copyFile, rename, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createNewProject, recoverCreateTarget } from '@icebreakers/monorepo'
import path from 'pathe'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from '@/utils/fs'
import { crashCreate, originalManifest, recoveryNow, snapshotTree } from './crash-fixture'

let root: string

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(tmpdir(), 'repoctl-manifest-recovery-'))
})

afterEach(async () => {
  await fs.remove(root)
})

describe('built create manifest recovery after process termination', () => {
  it.each([false, true])('restores the manifest and permits retry (existing: %s)', async (existing) => {
    if (existing) {
      await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), originalManifest)
    }
    const { manifestPath, targetDir, stagingDir } = await crashCreate(root)
    expect(await fs.readFile(manifestPath, 'utf8')).toContain('services/api')
    const before = await snapshotTree(root)

    const preview = await recoverCreateTarget(targetDir, { dryRun: true, now: recoveryNow() })
    expect(preview.manifest).toMatchObject({ path: manifestPath, status: 'would-restore' })
    expect(await snapshotTree(root)).toEqual(before)

    const result = await recoverCreateTarget(targetDir, { now: recoveryNow() })
    expect(result).toMatchObject({ targetRemoved: true, stagingRemoved: true, manifest: { status: 'restored' } })
    expect(await fs.pathExists(stagingDir)).toBe(false)
    if (existing) {
      expect(await fs.readFile(manifestPath, 'utf8')).toBe(originalManifest)
    }
    else {
      expect(await fs.pathExists(manifestPath)).toBe(false)
    }
    expect((await recoverCreateTarget(targetDir, { now: recoveryNow() })).status).toBe('missing')
    await createNewProject({ cwd: root, name: 'services/api', type: 'tsdown' })
    expect(await fs.pathExists(path.join(targetDir, 'package.json'))).toBe(true)
  })

  it.each([false, true])('keeps the pre-commit manifest intact (existing: %s)', async (existing) => {
    if (existing) {
      await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), originalManifest)
    }
    const { manifestPath, targetDir } = await crashCreate(root, 'before-commit')
    const result = await recoverCreateTarget(targetDir, { now: recoveryNow() })
    expect(result).toMatchObject({ targetRemoved: true, manifest: { status: 'unchanged' } })
    expect(await fs.pathExists(manifestPath)).toBe(existing)
    if (existing) {
      expect(await fs.readFile(manifestPath, 'utf8')).toBe(originalManifest)
    }
  })

  it.each(['edited', 'replaced', 'symlink'] as const)('preserves a manifest that was %s after the interruption', async (kind) => {
    await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), originalManifest)
    const { manifestPath, targetDir, stagingDir } = await crashCreate(root)
    if (kind === 'edited') {
      await fs.writeFile(manifestPath, 'packages: [user/*]\n')
    }
    else if (kind === 'replaced') {
      const replacement = path.join(root, 'replacement.yaml')
      await copyFile(manifestPath, replacement)
      await rename(replacement, manifestPath)
    }
    else {
      const saved = path.join(root, 'user-workspace.yaml')
      await rename(manifestPath, saved)
      await symlink(saved, manifestPath)
    }
    const before = await snapshotTree(root)
    const result = await recoverCreateTarget(targetDir, { now: recoveryNow() })
    expect(result).toMatchObject({ targetRemoved: false, stagingRemoved: false, removed: [], manifest: { status: 'preserved' } })
    expect(result.manifest?.reason).toBeTruthy()
    expect(await snapshotTree(root)).toEqual(before)
    expect(await fs.pathExists(stagingDir)).toBe(true)
  })

  it('retains the workspace inclusion while user files remain and restores it on retry', async () => {
    await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), originalManifest)
    const { manifestPath, targetDir } = await crashCreate(root)
    const userFile = path.join(targetDir, 'user.txt')
    await fs.writeFile(userFile, 'user data')
    const committed = await fs.readFile(manifestPath, 'utf8')
    const preview = await recoverCreateTarget(targetDir, { dryRun: true, now: recoveryNow() })
    expect(preview.manifest?.status).toBe('preserved')
    const result = await recoverCreateTarget(targetDir, { now: recoveryNow() })
    expect(result.manifest?.status).toBe('preserved')
    expect(result.targetRemoved).toBe(false)
    expect(result.removed).toContain('package.json')
    expect(result.preserved).toContain('user.txt')
    expect(await fs.readFile(userFile, 'utf8')).toBe('user data')
    expect(await fs.readFile(manifestPath, 'utf8')).toBe(committed)

    await fs.remove(userFile)
    const retried = await recoverCreateTarget(targetDir, { now: recoveryNow() })
    expect(retried).toMatchObject({ targetRemoved: true, stagingRemoved: true, manifest: { status: 'restored' } })
    expect(await fs.readFile(manifestPath, 'utf8')).toBe(originalManifest)
  })

  it.each(['missing', 'malformed'] as const)('retains evidence when the manifest recovery record is %s', async (kind) => {
    await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), originalManifest)
    const { targetDir, stagingDir } = await crashCreate(root)
    const recordPath = path.join(stagingDir, '.repoctl-create-manifest.json')
    if (kind === 'missing') {
      await fs.remove(recordPath)
    }
    else {
      await fs.writeFile(recordPath, '{broken')
    }
    const before = await snapshotTree(root)
    const result = await recoverCreateTarget(targetDir, { now: recoveryNow() })
    expect(result).toMatchObject({ targetRemoved: false, stagingRemoved: false, removed: [], manifest: { status: 'preserved' } })
    expect(await snapshotTree(root)).toEqual(before)
  })
})
