import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { getWorkspacePackageManager } from '@icebreakers/monorepo-templates'
import { describe, expect, it } from 'vitest'
import { initMetadata } from '@/commands/init'

describe('repo init package manager metadata', () => {
  it('uses the managed runtime and package manager for a new root manifest', async () => {
    const targetDir = await mkdtemp(path.join(tmpdir(), 'repoctl-init-package-manager-'))

    try {
      await initMetadata(targetDir)

      const packageJson = JSON.parse(await readFile(path.join(targetDir, 'package.json'), 'utf8')) as {
        packageManager?: string
        engines?: { node?: string }
      }
      expect(packageJson.packageManager).toBe(await getWorkspacePackageManager())
      expect(packageJson.engines?.node).toBe('^22.23.4 || ^24.22.1 || >=26.12.1')
    }
    finally {
      await rm(targetDir, { force: true, recursive: true })
    }
  })

  it('preserves existing root runtime and package manager declarations', async () => {
    const targetDir = await mkdtemp(path.join(tmpdir(), 'repoctl-init-existing-package-manager-'))

    try {
      await writeFile(path.join(targetDir, 'package.json'), `${JSON.stringify({
        name: 'existing-workspace',
        packageManager: 'pnpm@9.15.0',
        engines: { node: '^24.22.1' },
      }, null, 2)}\n`)

      await initMetadata(targetDir)

      const packageJson = JSON.parse(await readFile(path.join(targetDir, 'package.json'), 'utf8')) as {
        packageManager?: string
        engines?: { node?: string }
      }
      expect(packageJson.packageManager).toBe('pnpm@9.15.0')
      expect(packageJson.engines?.node).toBe('^24.22.1')
    }
    finally {
      await rm(targetDir, { force: true, recursive: true })
    }
  })
})
