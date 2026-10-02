import { tmpdir } from 'node:os'
import path from 'pathe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from '@/utils/fs'

let root: string

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(tmpdir(), 'repoctl-recover-cli-'))
  process.exitCode = 0
})

afterEach(async () => {
  process.exitCode = 0
  await fs.remove(root)
})

async function writeInterruptedTarget(withManifest = false) {
  const targetDir = path.join(root, 'apps/demo')
  const stagingDir = await fs.mkdtemp(path.join(root, '.repoctl-create-'))
  const createdAt = Date.now() - 2 * 24 * 60 * 60 * 1000
  const marker = {
    schemaVersion: withManifest ? 2 : 1,
    pid: 2 ** 31 - 1,
    cwd: root,
    targetDir,
    stagingDir,
    createdAt,
  }
  await fs.outputJson(path.join(stagingDir, '.repoctl-create.json'), marker)
  await fs.outputFile(path.join(stagingDir, 'project/generated.txt'), 'generated')
  await fs.outputFile(path.join(targetDir, 'generated.txt'), 'generated')
  await fs.outputJson(path.join(targetDir, '.repoctl-create-target.json'), marker)
  const manifestPath = path.join(root, 'pnpm-workspace.yaml')
  const original = 'packages:\n  - packages/*\n'
  const expected = `${original}  - apps/demo\n`
  if (withManifest) {
    await fs.writeFile(manifestPath, expected)
    const stat = await fs.stat(manifestPath)
    await fs.outputJson(path.join(stagingDir, '.repoctl-create-manifest.json'), {
      schemaVersion: 1,
      cwd: root,
      targetDir,
      stagingDir,
      kind: 'change',
      original,
      expected,
      published: { dev: stat.dev, ino: stat.ino, size: stat.size, mtimeMs: stat.mtimeMs },
    })
  }
  return { targetDir, stagingDir, manifestPath, original, expected }
}

describe('create recovery CLI', () => {
  it('renders a JSON dry-run without changing the target', async () => {
    const { targetDir, stagingDir } = await writeInterruptedTarget()
    const log = vi.spyOn((await import('@/core/logger')).logger, 'log').mockImplementation(() => {})
    const { runRecoverCreate } = await import('@/cli/commands/recovery')

    const result = await runRecoverCreate(root, 'apps/demo', { json: true })

    expect(result.dryRun).toBe(true)
    expect(result.result).toMatchObject({ status: 'stale', targetDir, dryRun: true, targetRemoved: false, stagingRemoved: false })
    expect(result.result.removed).toContain('generated.txt')
    expect(result.result.manifest).toMatchObject({ path: path.join(root, 'pnpm-workspace.yaml'), status: 'unknown' })
    expect(await fs.pathExists(targetDir)).toBe(true)
    expect(await fs.pathExists(stagingDir)).toBe(true)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"status": "stale"'))
    log.mockRestore()
  })

  it('executes safe recovery by default and removes a fully generated target', async () => {
    const { targetDir, stagingDir } = await writeInterruptedTarget()
    const log = vi.spyOn((await import('@/core/logger')).logger, 'log').mockImplementation(() => {})
    const { runRecoverCreate } = await import('@/cli/commands/recovery')

    const result = await runRecoverCreate(root, 'apps/demo')

    expect(result.dryRun).toBe(false)
    expect(result.result).toMatchObject({ status: 'stale', targetRemoved: true, stagingRemoved: true })
    expect(await fs.pathExists(targetDir)).toBe(false)
    expect(await fs.pathExists(stagingDir)).toBe(false)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Create recovery:'))
    expect(log).toHaveBeenCalledWith(expect.stringContaining('manifest status: unknown'))
    expect(log).toHaveBeenCalledWith(expect.stringContaining(`manifest reason: ${result.result.manifest?.reason}`))
    log.mockRestore()
  })

  it('includes a stable manifest restoration plan in JSON without changing files', async () => {
    const { targetDir, stagingDir, manifestPath, expected } = await writeInterruptedTarget(true)
    const log = vi.spyOn((await import('@/core/logger')).logger, 'log').mockImplementation(() => {})
    const { runRecoverCreate } = await import('@/cli/commands/recovery')

    const result = await runRecoverCreate(root, 'apps/demo', { json: true })

    expect(result.result.manifest).toEqual({ path: manifestPath, status: 'would-restore' })
    expect(JSON.parse(log.mock.calls[0]![0] as string).manifest).toEqual(result.result.manifest)
    expect(await fs.readFile(manifestPath, 'utf8')).toBe(expected)
    expect(await fs.pathExists(targetDir)).toBe(true)
    expect(await fs.pathExists(stagingDir)).toBe(true)
    log.mockRestore()
  })

  it('reports the restored manifest after executing recovery', async () => {
    const { targetDir, stagingDir, manifestPath, original } = await writeInterruptedTarget(true)
    const log = vi.spyOn((await import('@/core/logger')).logger, 'log').mockImplementation(() => {})
    const { runRecoverCreate } = await import('@/cli/commands/recovery')

    const result = await runRecoverCreate(root, 'apps/demo')

    expect(result.result.manifest).toEqual({ path: manifestPath, status: 'restored' })
    expect(await fs.readFile(manifestPath, 'utf8')).toBe(original)
    expect(await fs.pathExists(targetDir)).toBe(false)
    expect(await fs.pathExists(stagingDir)).toBe(false)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('manifest: pnpm-workspace.yaml'))
    expect(log).toHaveBeenCalledWith(expect.stringContaining('manifest status: restored'))
    log.mockRestore()
  })

  it('reports why an edited manifest and its recovery evidence were preserved', async () => {
    const { targetDir, stagingDir, manifestPath, expected } = await writeInterruptedTarget(true)
    const edited = `${expected}  - services/*\n`
    await fs.writeFile(manifestPath, edited)
    const log = vi.spyOn((await import('@/core/logger')).logger, 'log').mockImplementation(() => {})
    const { runRecoverCreate } = await import('@/cli/commands/recovery')

    const result = await runRecoverCreate(root, 'apps/demo')

    expect(result.result.manifest).toMatchObject({ path: manifestPath, status: 'preserved', reason: expect.any(String) })
    expect(await fs.readFile(manifestPath, 'utf8')).toBe(edited)
    expect(await fs.pathExists(targetDir)).toBe(true)
    expect(await fs.pathExists(stagingDir)).toBe(true)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('manifest status: preserved'))
    expect(log).toHaveBeenCalledWith(expect.stringContaining(`manifest reason: ${result.result.manifest?.reason}`))
    log.mockRestore()
  })

  it('returns a nonzero process status when no recoverable marker exists', async () => {
    const { runRecoverCreate } = await import('@/cli/commands/recovery')
    const log = vi.spyOn((await import('@/core/logger')).logger, 'log').mockImplementation(() => {})

    const result = await runRecoverCreate(root, 'apps/missing', { dryRun: true })

    expect(result.result.status).toBe('missing')
    expect(process.exitCode).toBe(1)
    log.mockRestore()
  })
})
