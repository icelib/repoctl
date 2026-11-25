import type { ReleaseOptions } from '@/commands/release/types'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sourcePackageManagerEnvironment } from '@/commands/release/recovery/environment'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('source package manager environment', () => {
  it('collapses case-insensitive PATH entries before spawning recovery commands', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'repoctl-recovery-environment-'))
    directories.push(root)
    const spawn = vi.fn(() => ({ status: 0 })) as unknown as NonNullable<ReleaseOptions['spawn']>
    const options: ReleaseOptions = {
      cwd: root,
      spawn,
      env: { Path: 'C:\\Windows\\System32', PATH: 'C:\\Git\\cmd', HOME: 'C:\\Users\\runner' },
    }

    const env = await sourcePackageManagerEnvironment(options, root)
    const pathEntries = Object.entries(env).filter(([key]) => key.toLowerCase() === 'path')

    expect(pathEntries).toHaveLength(1)
    expect(pathEntries[0]![0]).toBe('Path')
    expect(pathEntries[0]![1]).toBe([
      path.join(root, 'package-manager'),
      'C:\\Windows\\System32',
      'C:\\Git\\cmd',
    ].join(path.delimiter))
    expect(spawn).toHaveBeenCalledWith('corepack', ['enable', '--install-directory', path.join(root, 'package-manager'), 'pnpm'], expect.objectContaining({
      cwd: root,
      env: options.env,
    }))
  })
})
