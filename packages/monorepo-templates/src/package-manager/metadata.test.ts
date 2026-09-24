import { access, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createPackageManagerFixture } from './test-support/fixture'

describe('built workspace package manager API', () => {
  it('refreshes stale cached metadata and agent instructions in an isolated source workspace', async () => {
    const fixture = await createPackageManagerFixture()

    try {
      expect(await fixture.getPackageManager()).toBe(fixture.packageManager)
      const manifest = JSON.parse(await readFile(path.join(fixture.assetsDir, 'package.json'), 'utf8'))
      expect(manifest.packageManager).toBe(fixture.packageManager)
      expect(await readFile(path.join(fixture.assetsDir, 'npmrc'), 'utf8')).toBe(fixture.npmrc)
      expect(fixture.npmrc).toContain('package-manager-strict=true')
      expect(fixture.npmrc).toContain('package-manager-strict-version=true')
      expect(await readFile(path.join(fixture.assetsDir, 'pnpm-workspace.yaml'), 'utf8')).toContain('pmOnFail: error')
      await expect(access(path.join(fixture.assetsDir, '.npmrc'))).rejects.toMatchObject({ code: 'ENOENT' })
      for (const name of ['AGENTS.md', 'CLAUDE.md', '.agents/skills/repoctl/SKILL.md']) {
        const content = await readFile(path.join(fixture.assetsDir, name), 'utf8')
        expect(content).toContain('pnpm create repoctl@latest')
        expect(content).not.toContain('outdated cached asset')
      }
    }
    finally {
      await fixture.cleanup()
    }
  })

  it.each(['pnpm@12.5.1', 'pnpm@12.5.1-rc.0'])('preserves %s with a Corepack integrity hash during refresh', async (version) => {
    const fixture = await createPackageManagerFixture()
    const packageManager = `${version}+sha512.${'a'.repeat(128)}`

    try {
      await writeFile(path.join(fixture.root, 'package.json'), JSON.stringify({ name: 'repoctl-workspace', packageManager }))

      expect(await fixture.getPackageManager()).toBe(packageManager)
      expect(JSON.parse(await readFile(path.join(fixture.assetsDir, 'package.json'), 'utf8')).packageManager).toBe(packageManager)
    }
    finally {
      await fixture.cleanup()
    }
  })

  it.each([undefined, null, '', 'npm@12.5.1', 'pnpm@latest', 'pnpm@^12.5.1', 12])('rejects invalid published packageManager %j with the asset path', async (packageManager) => {
    const fixture = await createPackageManagerFixture()

    try {
      await fixture.usePublishedAssets(packageManager)

      await expect(fixture.getPackageManager()).rejects.toThrow(
        `Invalid packageManager in ${path.join(fixture.assetsDir, 'package.json')}; expected a pnpm version such as pnpm@12.5.1.`,
      )
    }
    finally {
      await fixture.cleanup()
    }
  })

  it('reports an explicit package manager error for a null published manifest', async () => {
    const fixture = await createPackageManagerFixture()

    try {
      await fixture.usePublishedAssets(fixture.packageManager)
      await writeFile(path.join(fixture.assetsDir, 'package.json'), 'null')

      await expect(fixture.getPackageManager()).rejects.toThrow(
        `Invalid packageManager in ${path.join(fixture.assetsDir, 'package.json')}; expected a pnpm version such as pnpm@12.5.1.`,
      )
    }
    finally {
      await fixture.cleanup()
    }
  })
})
