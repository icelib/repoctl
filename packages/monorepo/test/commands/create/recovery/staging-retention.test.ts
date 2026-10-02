import { lstat, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createNewProject, recoverCreateTarget } from '@icebreakers/monorepo'
import path from 'pathe'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from '@/utils/fs'

let root: string

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(tmpdir(), 'repoctl-staging-retention-'))
})

afterEach(async () => {
  await fs.remove(root)
})

async function writeStaleStaging() {
  const targetDir = path.join(root, 'apps/interrupted')
  const stagingDir = await fs.mkdtemp(path.join(root, '.repoctl-create-'))
  const marker = {
    schemaVersion: 1,
    pid: 2 ** 31 - 1,
    cwd: root,
    targetDir,
    stagingDir,
    createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
  }
  await fs.outputJson(path.join(stagingDir, '.repoctl-create.json'), marker)
  await fs.outputFile(path.join(stagingDir, 'project/generated.txt'), 'generated')
  return { marker, stagingDir, targetDir }
}

function createAnotherPackage() {
  return createNewProject({ cwd: root, name: 'packages/new-package', type: 'tsdown' })
}

describe('built create staging retention', () => {
  it('keeps an interrupted target recoverable when another package is created', async () => {
    const { marker, stagingDir, targetDir } = await writeStaleStaging()
    await fs.outputJson(path.join(targetDir, '.repoctl-create-target.json'), marker)
    await fs.outputFile(path.join(targetDir, 'generated.txt'), 'generated')

    await createAnotherPackage()

    expect(await fs.readFile(path.join(stagingDir, 'project/generated.txt'), 'utf8')).toBe('generated')
    const result = await recoverCreateTarget(targetDir)
    expect(result).toMatchObject({ status: 'stale', targetRemoved: true, stagingRemoved: true })
    expect(await fs.pathExists(targetDir)).toBe(false)
    expect(await fs.pathExists(stagingDir)).toBe(false)
  })

  it.each(['missing', 'malformed', 'mismatched'] as const)('retains staging with %s target ownership metadata', async (kind) => {
    const { marker, stagingDir, targetDir } = await writeStaleStaging()
    await fs.outputFile(path.join(targetDir, 'user.txt'), 'keep')
    if (kind === 'malformed') {
      await fs.outputFile(path.join(targetDir, '.repoctl-create-target.json'), '{broken')
    }
    else if (kind === 'mismatched') {
      await fs.outputJson(path.join(targetDir, '.repoctl-create-target.json'), {
        ...marker,
        stagingDir: path.join(root, '.repoctl-create-unknown'),
      })
    }

    await createAnotherPackage()

    expect(await fs.readFile(path.join(stagingDir, 'project/generated.txt'), 'utf8')).toBe('generated')
    expect(await fs.readFile(path.join(targetDir, 'user.txt'), 'utf8')).toBe('keep')
  })

  it('does not treat a dangling symbolic target as an absent target', async () => {
    const { stagingDir, targetDir } = await writeStaleStaging()
    await fs.ensureDir(path.dirname(targetDir))
    await symlink(path.join(root, 'missing-target'), targetDir, 'junction')

    await createAnotherPackage()

    expect(await fs.readFile(path.join(stagingDir, 'project/generated.txt'), 'utf8')).toBe('generated')
    expect((await lstat(targetDir)).isSymbolicLink()).toBe(true)
  })

  it('still cleans a stale staging directory when no target remains', async () => {
    const { stagingDir, targetDir } = await writeStaleStaging()

    await createAnotherPackage()

    expect(await fs.pathExists(targetDir)).toBe(false)
    expect(await fs.pathExists(stagingDir)).toBe(false)
    expect(await fs.pathExists(path.join(root, 'packages/new-package/package.json'))).toBe(true)
  })
})
