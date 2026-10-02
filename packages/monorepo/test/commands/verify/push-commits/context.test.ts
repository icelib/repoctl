import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getPushContext } from '@/commands/verify/pre-push/context'
import { clearWorkspaceCache } from '@/core/workspace'
import fs from '@/utils/fs'

const directories: string[] = []

async function fixture() {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'repoctl-push-context-')))
  directories.push(root)
  await fs.outputJson(path.join(root, 'package.json'), { private: true })
  await fs.outputJson(path.join(root, 'modules/a/package.json'), { name: 'fixture-a', private: true })
  await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages: [modules/*]\n')
  return root
}

afterEach(async () => {
  vi.unstubAllEnvs()
  clearWorkspaceCache()
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('committed workspace context', () => {
  it('discovers inside the snapshot even when pnpm environment variables point elsewhere', async () => {
    const root = await fixture()
    const outside = await fixture()
    vi.stubEnv('NPM_CONFIG_WORKSPACE_DIR', outside)
    vi.stubEnv('npm_config_workspace_dir', outside)

    const context = await getPushContext(root, 'modules/a')

    expect(context.cwd).toBe(root)
    expect(context.workspaceRoot).toBe(root)
    expect(context.workspaces).toEqual(['modules/a'])
    expect(context.needsInstall).toBe(false)
  })

  it('requires installation for a root prepare script without dependencies', async () => {
    const root = await fixture()
    await fs.writeJson(path.join(root, 'package.json'), { private: true, scripts: { prepare: 'node prepare.mjs' } })
    expect((await getPushContext(root, '')).needsInstall).toBe(true)
  })

  it('installs an explicit package outside manifest patterns in its own directory', async () => {
    const root = await fixture()
    const standalone = path.join(root, 'standalone')
    await fs.outputJson(path.join(standalone, 'package.json'), {
      name: 'fixture-standalone',
      private: true,
      dependencies: { 'fixture-a': 'file:../modules/a' },
      scripts: { test: 'node test.mjs' },
    })
    const context = await getPushContext(root, '', ['standalone'])
    expect(context.needsInstall).toBe(true)
    expect(context.installDirectories).toEqual([standalone])
  })

  it('rejects a missing committed cwd instead of validating a different parent workspace', async () => {
    const root = await fixture()
    await expect(getPushContext(root, 'removed/workspace')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects the nearest incorrectly named workspace manifest before reading parent patterns', async () => {
    const root = await fixture()
    await fs.writeFile(path.join(root, 'modules/a/pnpm-workspace.yml'), 'packages: []\n')
    await expect(getPushContext(root, 'modules/a')).rejects.toThrow('should be named "pnpm-workspace.yaml"')
  })

  it('does not mistake a similarly named directory for a workspace manifest', async () => {
    const root = await fixture()
    await fs.ensureDir(path.join(root, 'modules/a/pnpm-workspace.yml'))
    expect((await getPushContext(root, 'modules/a')).workspaceRoot).toBe(root)
  })
})
