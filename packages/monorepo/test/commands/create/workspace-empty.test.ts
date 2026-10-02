import { execFile } from 'node:child_process'
import { tmpdir } from 'node:os'
import process from 'node:process'
import { promisify } from 'node:util'
import { createNewProject, getWorkspacePackages, recoverCreateTarget, resolveCreateNewProjectPlan } from '@icebreakers/monorepo'
import { readWorkspaceManifest } from '@pnpm/workspace.read-manifest'
import path from 'pathe'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from '@/utils/fs'
import { crashCreate, recoveryNow, snapshotTree } from './recovery/crash-fixture'

let root: string
const execute = promisify(execFile)
const builtModule = new URL('../../../dist/index.mjs', import.meta.url).href
const targetName = 'services/platform/api'

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(tmpdir(), 'repoctl-create-empty-workspace-'))
  await fs.writeJson(path.join(root, 'package.json'), { name: 'workspace-fixture', private: true })
  await fs.writeFile(path.join(root, 'notes.txt'), 'Keep user notes.\n')
})

afterEach(async () => {
  await fs.remove(root)
})

async function packageNames() {
  return (await getWorkspacePackages(root, { ignorePrivatePackage: false })).map(pkg => pkg.manifest.name).sort()
}

async function failManifestCommit(phase: 'before' | 'after') {
  const script = `
    import fs from 'node:fs/promises'
    import path from 'node:path'
    import { syncBuiltinESMExports } from 'node:module'
    const [root, name, phase, moduleUrl] = process.argv.slice(1)
    const manifestPath = path.resolve(root, 'pnpm-workspace.yaml')
    const rename = fs.rename
    fs.rename = async function (source, target) {
      if (path.resolve(String(target)) !== manifestPath) return rename(source, target)
      if (phase === 'after') await rename(source, target)
      throw new Error('injected empty manifest commit failure')
    }
    syncBuiltinESMExports()
    const { createNewProject } = await import(moduleUrl)
    await createNewProject({ cwd: root, name, type: 'tsdown' })
  `
  return execute(process.execPath, ['--input-type=module', '-e', script, root, targetName, phase, builtModule], { timeout: 30000 })
}

describe('built creation with empty workspace manifests', () => {
  it.each([
    { name: 'empty', original: '' },
    { name: 'comment-only', original: '# Keep workspace notes\n' },
    { name: 'whitespace', original: ' \n\t\r\n  \n' },
  ])('initializes the $name manifest with exact paths and keeps repeated creation stable', async ({ original }) => {
    const manifestPath = path.join(root, 'pnpm-workspace.yaml')
    await fs.writeFile(manifestPath, original)
    await expect(readWorkspaceManifest(root)).rejects.toThrow()
    const before = await snapshotTree(root)
    const options = { cwd: root, name: targetName, type: 'tsdown' }

    const plan = await resolveCreateNewProjectPlan(options)

    expect(plan.workspaceManifest).toEqual({ path: manifestPath, changed: true, pattern: targetName })
    expect(await snapshotTree(root)).toEqual(before)

    await createNewProject(options)

    expect(await readWorkspaceManifest(root)).toEqual({ packages: [targetName] })
    expect(await packageNames()).toEqual(['api'])
    if (original.startsWith('#')) {
      expect(await fs.readFile(manifestPath, 'utf8')).toContain(original.trim())
    }
    const created = await snapshotTree(root)
    expect(await resolveCreateNewProjectPlan(options)).toMatchObject({
      targetExists: true,
      workspaceManifest: { path: manifestPath, changed: false },
    })
    expect(await snapshotTree(root)).toEqual(created)
    await expect(createNewProject(options)).rejects.toThrow('Target directory already exists')
    expect(await snapshotTree(root)).toEqual(created)

    const nextName = 'services/platform/worker'
    const nextOptions = { cwd: root, name: nextName, type: 'tsdown' }
    expect((await resolveCreateNewProjectPlan(nextOptions)).workspaceManifest).toEqual({ path: manifestPath, changed: true, pattern: nextName })
    expect(await snapshotTree(root)).toEqual(created)
    await createNewProject(nextOptions)
    expect(await readWorkspaceManifest(root)).toEqual({ packages: [targetName, nextName] })
    expect(await packageNames()).toEqual(['api', 'worker'])
  })

  it.each(['null\n', '{}\n'])('preserves the valid implicit manifest %j through preview and successive creations', async (original) => {
    const manifestPath = path.join(root, 'pnpm-workspace.yaml')
    await fs.writeFile(manifestPath, original)
    const expected = await readWorkspaceManifest(root)

    for (const name of [targetName, 'services/platform/worker']) {
      const before = await snapshotTree(root)
      const options = { cwd: root, name, type: 'tsdown' }
      expect((await resolveCreateNewProjectPlan(options)).workspaceManifest).toEqual({ path: manifestPath, changed: false })
      expect(await snapshotTree(root)).toEqual(before)
      await createNewProject(options)
      expect(await fs.readFile(manifestPath, 'utf8')).toBe(original)
      expect(await readWorkspaceManifest(root)).toEqual(expected)
      const created = await snapshotTree(root)
      await expect(createNewProject(options)).rejects.toThrow('Target directory already exists')
      expect(await snapshotTree(root)).toEqual(created)
    }
    expect(await packageNames()).toEqual(['api', 'worker'])
  })

  it.each([
    { original: '', phase: 'before' as const },
    { original: '', phase: 'after' as const },
    { original: '# Keep workspace notes\n', phase: 'before' as const },
    { original: '# Keep workspace notes\n', phase: 'after' as const },
  ])('restores an empty manifest and permits retry when commit fails: %j', async ({ original, phase }) => {
    const manifestPath = path.join(root, 'pnpm-workspace.yaml')
    await fs.writeFile(manifestPath, original)
    const before = await snapshotTree(root)

    await expect(failManifestCommit(phase)).rejects.toMatchObject({
      stderr: expect.stringContaining('injected empty manifest commit failure'),
    })

    expect(await snapshotTree(root)).toEqual(before)
    const options = { cwd: root, name: targetName, type: 'tsdown' }
    expect((await resolveCreateNewProjectPlan(options)).workspaceManifest).toEqual({ path: manifestPath, changed: true, pattern: targetName })
    expect(await snapshotTree(root)).toEqual(before)
    await createNewProject(options)
    expect(await readWorkspaceManifest(root)).toEqual({ packages: [targetName] })
    expect(await packageNames()).toEqual(['api'])
    if (original) {
      expect(await fs.readFile(manifestPath, 'utf8')).toContain(original.trim())
    }
  }, 30000)

  it.each(['', '# Restore workspace notes\n'])('recovers the original empty document after process termination: %j', async (original) => {
    await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), original)
    const { manifestPath, targetDir, stagingDir } = await crashCreate(root)
    expect(await readWorkspaceManifest(root)).toEqual({ packages: ['services/api'] })
    const interrupted = await snapshotTree(root)

    const preview = await recoverCreateTarget(targetDir, { dryRun: true, now: recoveryNow() })
    expect(preview.manifest).toMatchObject({ path: manifestPath, status: 'would-restore' })
    expect(await snapshotTree(root)).toEqual(interrupted)

    const recovered = await recoverCreateTarget(targetDir, { now: recoveryNow() })
    expect(recovered).toMatchObject({ targetRemoved: true, stagingRemoved: true, manifest: { status: 'restored' } })
    expect(await fs.readFile(manifestPath, 'utf8')).toBe(original)
    expect(await fs.pathExists(stagingDir)).toBe(false)
    expect((await recoverCreateTarget(targetDir, { now: recoveryNow() })).status).toBe('missing')

    await createNewProject({ cwd: root, name: 'services/api', type: 'tsdown' })
    expect(await readWorkspaceManifest(root)).toEqual({ packages: ['services/api'] })
    expect(await packageNames()).toEqual(['api'])
  }, 30000)
})
