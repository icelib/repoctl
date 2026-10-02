import path from 'pathe'
import { describe, expect, it, vi } from 'vitest'
import fs from '@/utils/fs'
import { createTempOutDir, registerUpgradeFixtureCleanup, setInteractiveTTY } from './fixtures'

registerUpgradeFixtureCleanup()

describe('upgradeMonorepo overwrite logic', () => {
  it('skips overwriting LICENSE when already present', async () => {
    const checkboxMock = vi.fn(async () => [])
    const { outDir } = await createTempOutDir('monorepo-upgrade-license-')

    await vi.resetModules()
    vi.doMock('@icebreakers/monorepo-templates', async () => {
      const actual = await vi.importActual<typeof import('@icebreakers/monorepo-templates')>('@icebreakers/monorepo-templates')
      return {
        ...actual,
        checkbox: checkboxMock,
      }
    })
    const { upgradeMonorepo } = await import('@/commands/upgrade')

    await upgradeMonorepo({ outDir, overwrite: true })
    const licensePath = path.join(outDir, 'LICENSE')
    expect(await fs.pathExists(licensePath)).toBe(true)

    await fs.writeFile(licensePath, '# custom license\n', 'utf8')
    setInteractiveTTY()
    await upgradeMonorepo({ outDir, overwrite: true })

    const content = await fs.readFile(licensePath, 'utf8')
    expect(content).toBe('# custom license\n')
    expect(checkboxMock).not.toHaveBeenCalled()
  })

  it('honors skipOverwrite for existing files', async () => {
    const checkboxMock = vi.fn(async () => [])
    const { outDir } = await createTempOutDir('monorepo-upgrade-skip-')

    await vi.resetModules()
    vi.doMock('@icebreakers/monorepo-templates', async () => {
      const actual = await vi.importActual<typeof import('@icebreakers/monorepo-templates')>('@icebreakers/monorepo-templates')
      return {
        ...actual,
        checkbox: checkboxMock,
      }
    })
    const { upgradeMonorepo } = await import('@/commands/upgrade')
    await upgradeMonorepo({ outDir, overwrite: true })
    const targetFile = path.join(outDir, 'Dockerfile')
    await fs.writeFile(targetFile, '# custom configuration\n')
    await upgradeMonorepo({ outDir, skipOverwrite: true })
    const content = await fs.readFile(targetFile, 'utf8')
    expect(content).toBe('# custom configuration\n')

    expect(checkboxMock).not.toHaveBeenCalled()
  })

  it('force-overwrites a custom release workflow without changing other no-overwrite assets', async () => {
    const { outDir } = await createTempOutDir('monorepo-upgrade-release-')
    const workflowPath = path.join(outDir, '.github/workflows/release.yml')
    const configPath = path.join(outDir, 'repoctl.config.ts')

    await vi.resetModules()
    const { upgradeMonorepo } = await import('@/commands/upgrade')
    await upgradeMonorepo({ outDir, overwrite: true })

    await fs.writeFile(configPath, [
      'export default {',
      '  commands: {',
      '    upgrade: { noOverwrite: true },',
      '  },',
      '}\n',
    ].join('\n'), 'utf8')
    await fs.writeFile(workflowPath, 'name: custom\njobs: {}\n', 'utf8')
    const originalConfig = await fs.readFile(configPath, 'utf8')

    await upgradeMonorepo({ cwd: outDir, yes: true, overwriteRelease: true })

    const workflow = await fs.readFile(workflowPath, 'utf8')
    expect(workflow).toContain('# repoctl-managed: release/v2')
    expect(workflow).not.toContain('detect-release-trigger:')
    expect(workflow).toContain('run: pnpm exec repo release ci')
    expect(await fs.readFile(configPath, 'utf8')).toBe(originalConfig)
  })

  it('prompts when contents differ and rewrites selected files', async () => {
    const { outDir } = await createTempOutDir('monorepo-upgrade-rewrite-')
    const targetFile = path.join(outDir, 'Dockerfile')
    const checkboxMock = vi.fn(async (options: { choices?: Array<{ value: string }> }) => {
      const choices = Array.isArray(options?.choices) ? options.choices : []
      const match = choices.find(item => item.value === targetFile)
      return match ? [match.value] : []
    })

    await vi.resetModules()
    vi.doMock('@icebreakers/monorepo-templates', async () => {
      const actual = await vi.importActual<typeof import('@icebreakers/monorepo-templates')>('@icebreakers/monorepo-templates')
      return {
        ...actual,
        checkbox: checkboxMock,
      }
    })
    const { assetsDir } = await import('@/constants')
    const reference = await fs.readFile(path.join(assetsDir, 'Dockerfile'), 'utf8')
    const { upgradeMonorepo } = await import('@/commands/upgrade')

    await upgradeMonorepo({ outDir })
    await fs.writeFile(targetFile, '# drifted\n')
    setInteractiveTTY()
    await upgradeMonorepo({ outDir })
    expect(checkboxMock).toHaveBeenCalledTimes(1)
    const rewritten = await fs.readFile(targetFile, 'utf8')
    expect(rewritten).toBe(reference)

    await upgradeMonorepo({ outDir })
    expect(checkboxMock).toHaveBeenCalledTimes(1)
  })

  it('supports interactive selection without legacy config migration', async () => {
    const checkboxMock = vi.fn(async (options: { choices?: Array<{ value: string }> }) => {
      const choices = Array.isArray(options?.choices) ? options.choices : []
      return choices.filter(item => item.value === '.changeset').map(item => item.value)
    })
    class GitClientMock {
      async getRepoName() {
        return 'ice/awesome'
      }
    }
    const { outDir } = await createTempOutDir('monorepo-upgrade-interactive-')

    await vi.resetModules()
    vi.doMock('@icebreakers/monorepo-templates', async () => {
      const actual = await vi.importActual<typeof import('@icebreakers/monorepo-templates')>('@icebreakers/monorepo-templates')
      return {
        ...actual,
        checkbox: checkboxMock,
      }
    })
    vi.doMock('@/core/git', () => ({ GitClient: GitClientMock }))

    const { upgradeMonorepo } = await import('@/commands/upgrade')
    setInteractiveTTY()
    await upgradeMonorepo({ outDir, interactive: true })

    const configPath = path.join(outDir, '.changeset/config.json')
    expect(await fs.pathExists(configPath)).toBe(false)
    expect(checkboxMock).toHaveBeenCalledTimes(1)
  })

  it('preserves the entire release migration group when only its state deletion is selected', async () => {
    const { outDir } = await createTempOutDir('monorepo-upgrade-partial-migration-')
    const prePath = path.join(outDir, '.changeset/pre.json')
    const checkboxMock = vi.fn(async (options: { choices?: Array<{ value: string }> }) => {
      return (options.choices ?? []).filter(item => item.value === prePath).map(item => item.value)
    })
    vi.doMock('@icebreakers/monorepo-templates', async () => {
      const actual = await vi.importActual<typeof import('@icebreakers/monorepo-templates')>('@icebreakers/monorepo-templates')
      return { ...actual, checkbox: checkboxMock }
    })
    const { upgradeMonorepo } = await import('@/commands/upgrade')
    await upgradeMonorepo({ cwd: outDir, yes: true })
    await fs.outputJSON(path.join(outDir, 'package.json'), {
      name: 'fixture',
      private: true,
      devDependencies: { '@changesets/cli': '^2.0.0' },
    })
    await fs.outputJSON(path.join(outDir, 'packages/demo/package.json'), { name: 'demo', version: '1.0.0' })
    await fs.outputJSON(path.join(outDir, '.changeset/config.json'), {})
    await fs.outputJSON(prePath, { mode: 'pre', tag: 'beta' })
    await fs.writeFile(path.join(outDir, '.github/workflows/release.yml'), 'uses: changesets/action@v1\nwith:\n  publish-script: pnpm changeset publish\n')
    const groupPaths = ['.github/workflows/release.yml', 'pnpm-workspace.yaml', 'package.json', '.changeset/config.json', '.changeset/pre.json']
    const before = await Promise.all(groupPaths.map(file => fs.readFile(path.join(outDir, file), 'utf8')))
    setInteractiveTTY()

    await upgradeMonorepo({ cwd: outDir })

    expect(checkboxMock).toHaveBeenCalledTimes(1)
    const after = await Promise.all(groupPaths.map(file => fs.readFile(path.join(outDir, file), 'utf8')))
    expect(after).toEqual(before)
  })
})
