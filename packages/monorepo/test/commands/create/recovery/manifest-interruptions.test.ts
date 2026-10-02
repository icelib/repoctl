import type { RecoverCreateTargetResult } from '@icebreakers/monorepo'
import { execFile } from 'node:child_process'
import { chmod, lstat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { recoverCreateTarget } from '@icebreakers/monorepo'
import path from 'pathe'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from '@/utils/fs'
import { crashCreate, originalManifest, recoveryNow } from './crash-fixture'

let root: string
const execute = promisify(execFile)
const builtModule = new URL('../../../../dist/index.mjs', import.meta.url).href

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(tmpdir(), 'repoctl-recovery-interruption-'))
})

afterEach(async () => {
  await fs.remove(root)
})

async function runRecovery(targetDir: string, mode: 'interrupt' | 'fail-rename') {
  const script = `
    import fs from 'node:fs/promises'
    import path from 'node:path'
    import { syncBuiltinESMExports } from 'node:module'
    const [root, targetDir, mode, moduleUrl] = process.argv.slice(1)
    const manifestPath = path.join(root, 'pnpm-workspace.yaml')
    const rename = fs.rename
    fs.rename = async function (source, target) {
      if (target === manifestPath && mode === 'fail-rename') throw new Error('recovery write failed')
      const result = await rename(source, target)
      if (target === manifestPath && mode === 'interrupt') process.exit(87)
      return result
    }
    const unlink = fs.unlink
    fs.unlink = async function (target) {
      const result = await unlink(target)
      if (target === manifestPath && mode === 'interrupt') process.exit(87)
      return result
    }
    syncBuiltinESMExports()
    const { recoverCreateTarget } = await import(moduleUrl)
    const result = await recoverCreateTarget(targetDir, { now: Date.now() + 2 * 24 * 60 * 60 * 1000 })
    console.log(JSON.stringify(result))
  `
  return execute(process.execPath, ['--input-type=module', '-e', script, root, targetDir, mode, builtModule], { timeout: 30000 })
}

describe('built create manifest recovery interruptions', () => {
  it.each([false, true])('resumes after restoration commits before the recovery process exits (existing: %s)', async (existing) => {
    if (existing) {
      await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), originalManifest)
    }
    const { manifestPath, targetDir, stagingDir } = await crashCreate(root)

    await expect(runRecovery(targetDir, 'interrupt')).rejects.toMatchObject({ code: 87 })
    expect(await fs.pathExists(path.join(targetDir, '.repoctl-create-target.json'))).toBe(true)
    expect(await fs.pathExists(stagingDir)).toBe(true)
    if (existing) {
      expect(await fs.readFile(manifestPath, 'utf8')).toBe(originalManifest)
    }
    else {
      expect(await fs.pathExists(manifestPath)).toBe(false)
    }

    const retried = await recoverCreateTarget(targetDir, { now: recoveryNow() })
    expect(retried).toMatchObject({ targetRemoved: true, stagingRemoved: true, manifest: { status: 'unchanged' } })
    expect(await fs.pathExists(targetDir)).toBe(false)
    expect(await fs.pathExists(stagingDir)).toBe(false)
  })

  it('retains the recovery evidence after a manifest write failure and permits retry', async () => {
    await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), originalManifest)
    const { manifestPath, targetDir, stagingDir } = await crashCreate(root)
    const committed = await fs.readFile(manifestPath, 'utf8')

    const { stdout } = await runRecovery(targetDir, 'fail-rename')
    const failed = JSON.parse(stdout.trim()) as RecoverCreateTargetResult
    expect(failed).toMatchObject({ targetRemoved: false, stagingRemoved: false, manifest: { status: 'preserved' } })
    expect(failed.manifest?.reason).toContain('restoration failed')
    expect(await fs.readFile(manifestPath, 'utf8')).toBe(committed)
    expect(await fs.pathExists(path.join(targetDir, '.repoctl-create-target.json'))).toBe(true)
    expect(await fs.pathExists(path.join(stagingDir, '.repoctl-create-manifest.json'))).toBe(true)
    expect((await fs.readdir(stagingDir)).some(entry => entry.startsWith('.repoctl-manifest-restore-'))).toBe(false)

    const retried = await recoverCreateTarget(targetDir, { now: recoveryNow() })
    expect(retried).toMatchObject({ targetRemoved: true, stagingRemoved: true, manifest: { status: 'restored' } })
    expect(await fs.readFile(manifestPath, 'utf8')).toBe(originalManifest)
  })

  it('recovers a create whose existing workspace pattern needed no manifest update', async () => {
    const manifestPath = path.join(root, 'pnpm-workspace.yaml')
    const original = 'packages: [services/*]\n'
    await fs.writeFile(manifestPath, original)
    const { targetDir, stagingDir } = await crashCreate(root)

    const result = await recoverCreateTarget(targetDir, { now: recoveryNow() })

    expect(result).toMatchObject({ targetRemoved: true, stagingRemoved: true, manifest: { status: 'unchanged' } })
    expect(await fs.readFile(manifestPath, 'utf8')).toBe(original)
    expect(await fs.pathExists(stagingDir)).toBe(false)
  })

  it('restores the original manifest file permissions', async () => {
    const manifestPath = path.join(root, 'pnpm-workspace.yaml')
    await fs.writeFile(manifestPath, originalManifest)
    await chmod(manifestPath, 0o600)
    // Windows exposes a reduced permission model; compare the mode the host
    // actually stores instead of assuming POSIX permission bits.
    const originalMode = (await lstat(manifestPath)).mode & 0o777
    const { targetDir } = await crashCreate(root)

    const result = await recoverCreateTarget(targetDir, { now: recoveryNow() })

    expect(result.manifest?.status).toBe('restored')
    expect((await lstat(manifestPath)).mode & 0o777).toBe(originalMode)
    expect(await fs.readFile(manifestPath, 'utf8')).toBe(originalManifest)
  })

  it('reports unknown manifest state when recovering an older transaction', async () => {
    await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), originalManifest)
    const { manifestPath, targetDir, stagingDir } = await crashCreate(root)
    const committed = await fs.readFile(manifestPath, 'utf8')
    for (const markerPath of [path.join(targetDir, '.repoctl-create-target.json'), path.join(stagingDir, '.repoctl-create.json')]) {
      const marker = await fs.readJson(markerPath)
      await fs.writeJson(markerPath, { ...marker, schemaVersion: 1 })
    }
    await fs.remove(path.join(stagingDir, '.repoctl-create-manifest.json'))

    const result = await recoverCreateTarget(targetDir, { now: recoveryNow() })

    expect(result).toMatchObject({ targetRemoved: true, stagingRemoved: true, manifest: { status: 'unknown' } })
    expect(result.manifest?.reason).toContain('older create transaction')
    expect(await fs.readFile(manifestPath, 'utf8')).toBe(committed)
  })
})
