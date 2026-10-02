import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { getWorkspacePackageManager } from '@icebreakers/monorepo-templates'
import { describe, expect, it } from 'vitest'
import { initMetadata } from '@/commands/init'
import { clearWorkspaceCache, getWorkspaceData } from '@/core/workspace'

describe('repo init package manager metadata', () => {
  it('uses the managed workspace package manager for a new root manifest', async () => {
    const targetDir = await mkdtemp(path.join(tmpdir(), 'repoctl-init-package-manager-'))

    try {
      await initMetadata(targetDir)

      const packageJson = JSON.parse(await readFile(path.join(targetDir, 'package.json'), 'utf8')) as {
        packageManager?: string
      }
      expect(packageJson.packageManager).toBe(await getWorkspacePackageManager())
    }
    finally {
      await rm(targetDir, { force: true, recursive: true })
    }
  })

  it('preserves an existing root package manager declaration', async () => {
    const targetDir = await mkdtemp(path.join(tmpdir(), 'repoctl-init-existing-package-manager-'))

    try {
      await writeFile(path.join(targetDir, 'package.json'), `${JSON.stringify({
        name: 'existing-workspace',
        packageManager: 'pnpm@9.15.0',
      }, null, 2)}\n`)

      await initMetadata(targetDir)

      const packageJson = JSON.parse(await readFile(path.join(targetDir, 'package.json'), 'utf8')) as {
        packageManager?: string
      }
      expect(packageJson.packageManager).toBe('pnpm@9.15.0')
    }
    finally {
      await rm(targetDir, { force: true, recursive: true })
    }
  })

  it('invalidates discovery after creating a workspace manifest', async () => {
    const targetDir = await mkdtemp(path.join(tmpdir(), 'repoctl-init-discovery-'))
    const nestedDir = path.join(targetDir, 'tools')
    const packageDir = path.join(targetDir, 'packages/before-init')

    try {
      await mkdir(nestedDir, { recursive: true })
      await mkdir(packageDir, { recursive: true })
      await writeFile(path.join(packageDir, 'package.json'), `${JSON.stringify({
        name: 'before-init',
        version: '0.0.0',
      })}\n`)

      clearWorkspaceCache()
      expect((await getWorkspaceData(nestedDir)).packages).toEqual([])

      await initMetadata(targetDir)

      expect((await getWorkspaceData(nestedDir)).packages.map(pkg => pkg.manifest.name)).toEqual(['before-init'])
    }
    finally {
      clearWorkspaceCache()
      await rm(targetDir, { force: true, recursive: true })
    }
  })
})
