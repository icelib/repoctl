import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { updateRootPackageJson } from './package-json'
import { scaffoldFromNpm } from './source-npm'
import { updateRootTsconfigReferences } from './tsconfig'

describe('scaffoldFromNpm', () => {
  it('generates clean tooling imports and tsconfig references for selected templates', async () => {
    const targetDir = await mkdtemp(path.join(tmpdir(), 'create-repoctl-scaffold-'))

    try {
      const sourcePackageJson = JSON.parse(await readFile(new URL('../../../package.json', import.meta.url), 'utf8')) as {
        packageManager?: string
      }
      await scaffoldFromNpm(targetDir, ['cli', 'tsdown'], true)
      await updateRootPackageJson(targetDir, 'demo-repo')
      await updateRootTsconfigReferences(targetDir)

      const [rootVitestConfig, rootTsconfig, rootPackageJson, npmrc, releaseWorkflow, agents, skill] = await Promise.all([
        readFile(path.join(targetDir, 'vitest.config.ts'), 'utf8'),
        readFile(path.join(targetDir, 'tsconfig.json'), 'utf8'),
        readFile(path.join(targetDir, 'package.json'), 'utf8'),
        readFile(path.join(targetDir, '.npmrc'), 'utf8'),
        readFile(path.join(targetDir, '.github/workflows/release.yml'), 'utf8'),
        readFile(path.join(targetDir, 'AGENTS.md'), 'utf8'),
        readFile(path.join(targetDir, '.agents/skills/repoctl/SKILL.md'), 'utf8'),
      ])
      const parsedPackageJson = JSON.parse(rootPackageJson) as {
        packageManager?: string
        devDependencies?: Record<string, string>
      }
      const parsedTsconfig = JSON.parse(rootTsconfig) as {
        references?: Array<{ path: string }>
      }

      expect(agents).toContain('managed by **repoctl**')
      expect(agents).not.toContain('source workspace for repoctl')
      expect(skill).toContain('pnpm create repoctl@latest')
      expect(parsedPackageJson.packageManager).toBe(sourcePackageJson.packageManager)
      expect(parsedPackageJson.devDependencies?.['repoctl']).toBe('latest')
      expect(npmrc).toContain('package-manager-strict=true')
      expect(npmrc).toContain('package-manager-strict-version=true')
      expect(await readFile(path.join(targetDir, 'pnpm-workspace.yaml'), 'utf8')).toMatch(/^pmOnFail: error$/mu)
      expect(rootVitestConfig).toContain(`from 'repoctl/tooling'`)
      expect(rootVitestConfig).not.toContain('tooling/load-tooling-module.mjs')
      expect(releaseWorkflow).not.toContain('Build Release Tooling')
      expect(releaseWorkflow).not.toContain('pnpm run tooling:build')
      expect(parsedTsconfig.references).toEqual([
        { path: './apps/cli' },
        { path: './packages/tsdown' },
      ])
    }
    finally {
      await rm(targetDir, { force: true, recursive: true })
    }
  })
})
