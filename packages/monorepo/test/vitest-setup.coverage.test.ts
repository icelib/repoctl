import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPackageManagerFixture } from '../../monorepo-templates/src/package-manager/test-support/fixture'

afterEach(() => {
  vi.doUnmock('@icebreakers/monorepo-templates')
  vi.unstubAllEnvs()
})

describe('test setup readiness', () => {
  it('refreshes stale built assets even when LICENSE exists and isolates runner metadata', async () => {
    const fixture = await createPackageManagerFixture()
    try {
      expect(await readFile(path.join(fixture.assetsDir, 'LICENSE'), 'utf8')).toBe('outdated cached asset\n')
      for (const name of ['GITHUB_EVENT_NAME', 'GITHUB_EVENT_PATH', 'GITHUB_REF_NAME', 'GITHUB_SHA']) {
        vi.stubEnv(name, 'runner-specific-value')
      }
      await vi.resetModules()
      vi.doMock('@icebreakers/monorepo-templates', () => ({
        ensureTemplateAssetsPrepared: async () => { await fixture.getPackageManager() },
      }))
      await import('../vitest.setup')
      expect(JSON.parse(await readFile(path.join(fixture.assetsDir, 'package.json'), 'utf8')).packageManager).toBe(fixture.packageManager)
      expect(await readFile(path.join(fixture.assetsDir, 'npmrc'), 'utf8')).toBe(fixture.npmrc)
      expect(await readFile(path.join(fixture.assetsDir, 'pnpm-workspace.yaml'), 'utf8')).toContain('pmOnFail: error')
      for (const name of ['GITHUB_EVENT_NAME', 'GITHUB_EVENT_PATH', 'GITHUB_REF_NAME', 'GITHUB_SHA']) {
        expect(process.env[name]).toBeUndefined()
      }
    }
    finally {
      await fixture.cleanup()
    }
  })

  it('stops test execution when asset preparation fails', async () => {
    await vi.resetModules()
    vi.doMock('@icebreakers/monorepo-templates', () => ({
      ensureTemplateAssetsPrepared: async () => { throw new Error('fixture preparation failed') },
    }))
    await expect(import('../vitest.setup')).rejects.toThrow('fixture preparation failed')
  })
})
