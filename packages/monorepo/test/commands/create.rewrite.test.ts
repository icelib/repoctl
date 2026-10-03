import { tmpdir } from 'node:os'
import path from 'pathe'
import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from '@/utils/fs'
import { loadedConfigFixture } from '../helpers/config'

afterEach(async () => {
  await vi.resetModules()
  vi.resetAllMocks()
})

describe('createNewProject root reference rewriting', () => {
  it('rewrites root relative references when the target path is deeper than the default template layout', async () => {
    const workspaceDir = await fs.mkdtemp(path.join(tmpdir(), 'monorepo-create-rewrite-'))
    const templatesDir = path.join(workspaceDir, 'custom-templates')
    const sourceDir = path.join(templatesDir, 'deep-template')

    await fs.ensureDir(sourceDir)
    await fs.writeJSON(path.join(sourceDir, 'package.json'), {
      name: '@demo/deep-template',
      version: '1.0.0',
    }, { spaces: 2 })
    await fs.writeFile(path.join(sourceDir, 'tsconfig.json'), '{\n  "extends": "../../tsconfig.json"\n}\n')
    await fs.writeFile(
      path.join(sourceDir, 'vitest.config.ts'),
      [
        'import { loadRepoctlToolingModule } from \'../../tooling/load-tooling-module.mjs\'',
        'const { defineVitestProjectConfig } = await loadRepoctlToolingModule()',
        'export default await defineVitestProjectConfig()',
        '',
      ].join('\n'),
    )

    vi.doMock('@/core/config', () => ({
      loadMonorepoConfigDetails: vi.fn(async () => loadedConfigFixture({ commands: { create: {
        templatesDir,
        templateMap: { custom: { source: 'deep-template', target: 'apps/client' } },
      } } }, path.join(workspaceDir, 'repoctl.config.mjs'))),
    }))
    vi.doMock('@/core/logger', () => ({
      logger: {
        success: vi.fn(),
      },
    }))
    vi.doMock('@/core/git', () => ({
      GitClient: class {
        async getRepoName() {
          return 'demo/repo'
        }

        async getRepoRoot() {
          return workspaceDir
        }

        async getUser() {
          return { name: 'Dev Example', email: 'dev@example.com' }
        }
      },
    }))

    const { createNewProject } = await import('@/commands/create')

    await createNewProject({
      cwd: workspaceDir,
      name: 'apps/platform/web/client',
      type: 'custom',
    })

    const generatedTsconfig = await fs.readFile(
      path.join(workspaceDir, 'apps/platform/web/client/tsconfig.json'),
      'utf8',
    )
    const generatedVitestConfig = await fs.readFile(
      path.join(workspaceDir, 'apps/platform/web/client/vitest.config.ts'),
      'utf8',
    )
    const generatedWorkspaceManifest = await fs.readFile(path.join(workspaceDir, 'pnpm-workspace.yaml'), 'utf8')

    expect(generatedTsconfig).toContain('"extends": "../../../../tsconfig.json"')
    expect(generatedVitestConfig).toContain(`from 'repoctl/tooling'`)
    expect(generatedVitestConfig).not.toContain('tooling/load-tooling-module.mjs')
    expect(generatedWorkspaceManifest).toContain('apps/*')

    await fs.remove(workspaceDir)
  })
})
