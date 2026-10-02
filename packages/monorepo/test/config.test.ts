import { tmpdir } from 'node:os'
import path from 'pathe'
import { describe, expect, it, vi } from 'vitest'

import { createNewProject } from '@/commands/create'
import fs from '@/utils/fs'

const templatesRoot = path.resolve(__dirname, '../../..', 'templates')
function writeConfig(dir: string, content: string, filename = 'repoctl.config.ts') {
  return fs.writeFile(path.join(dir, filename), content, 'utf8')
}

describe('monorepo config integration', () => {
  it('prefers repoctl config when present', async () => {
    await vi.resetModules()
    const root = await fs.mkdtemp(path.join(tmpdir(), 'repoctl-config-prefer-'))

    await writeConfig(
      root,
      `export default {\n  commands: {\n    clean: {\n      autoConfirm: true,\n    },\n  },\n}\n`,
      'repoctl.config.ts',
    )

    const { loadMonorepoConfig, resolveCommandConfig } = await import('@/core/config')
    const config = await loadMonorepoConfig(root)

    expect(config.commands?.clean?.autoConfirm).toBe(true)
    expect(await resolveCommandConfig('clean', root)).toMatchObject({
      autoConfirm: true,
    })

    await fs.remove(root)
  })

  it('ignores legacy monorepo config files', async () => {
    await vi.resetModules()
    const root = await fs.mkdtemp(path.join(tmpdir(), 'repoctl-config-legacy-'))

    await writeConfig(root, `export default { commands: { clean: { autoConfirm: false } } }\n`, 'monorepo.config.ts')

    const { loadMonorepoConfig } = await import('@/core/config')

    expect(await loadMonorepoConfig(root)).toEqual({})

    await fs.remove(root)
  })

  it('overrides create command defaults', async () => {
    await vi.resetModules()
    const root = await fs.mkdtemp(path.join(tmpdir(), 'monorepo-config-create-'))
    await writeConfig(
      root,
      `export default {\n  commands: {\n    create: {\n      defaultTemplate: 'cli',\n      renameJson: true,\n      templatesDir: ${JSON.stringify(path.relative(root, templatesRoot))},\n    },\n  },\n}\n`,
    )

    const targetDir = path.join(root, 'demo-app')
    await createNewProject({
      cwd: root,
      name: 'demo-app',
    })

    expect(await fs.pathExists(path.join(targetDir, 'package.mock.json'))).toBe(true)

    await fs.remove(root)
  })

  it('allows clean command to run without prompt via config', async () => {
    await vi.resetModules()
    const root = await fs.mkdtemp(path.join(tmpdir(), 'monorepo-config-clean-'))
    const workspaceDir = path.join(root, 'workspace')
    const packagesDir = path.join(workspaceDir, 'packages')
    const fooDir = path.join(packagesDir, 'foo')

    await fs.ensureDir(fooDir)
    await fs.ensureDir(packagesDir)
    await fs.ensureDir(workspaceDir)
    await fs.writeJson(path.join(workspaceDir, 'package.json'), {
      devDependencies: {
        '@icebreakers/monorepo': 'latest',
      },
    }, { spaces: 2 })

    await writeConfig(
      workspaceDir,
      `export default {\n  commands: {\n    clean: {\n      autoConfirm: true,\n    },\n  },\n}\n`,
    )

    const checkboxMock = vi.fn()
    vi.doMock('@icebreakers/monorepo-templates', async () => {
      const actual = await vi.importActual<typeof import('@icebreakers/monorepo-templates')>('@icebreakers/monorepo-templates')
      return {
        ...actual,
        checkbox: checkboxMock,
      }
    })
    vi.doMock('@/core/workspace', () => ({
      getWorkspaceData: vi.fn(async () => ({
        packages: [
          {
            manifest: { name: 'foo' },
            rootDir: fooDir,
            rootDirRealPath: fooDir,
            pkgJsonPath: path.join(fooDir, 'package.json'),
          },
        ],
        workspaceDir,
      })),
      clearWorkspaceCache: vi.fn(),
    }))

    const { cleanProjects: mockedClean } = await import('@/commands/clean')
    await mockedClean(workspaceDir)

    expect(checkboxMock).not.toHaveBeenCalled()
    expect(await fs.pathExists(fooDir)).toBe(false)

    await vi.resetModules()
    await fs.remove(root)
  })
})
