import CI from 'ci-info'
import path from 'pathe'
import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from '@/utils/fs'
import { createTempOutDir } from './fixture'

afterEach(async () => {
  await vi.resetModules()
  vi.resetAllMocks()
})

describe('upgradeMonorepo overwrite logic', () => {
  it('skips overwriting LICENSE when already present', async () => {
    const checkboxMock = vi.fn(async () => [])
    const { root, outDir } = await createTempOutDir('monorepo-upgrade-license-')

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
    Object.defineProperty(process.stdin, 'isTTY', {
      configurable: true,
      value: true,
    })
    Object.defineProperty(process.stdout, 'isTTY', {
      configurable: true,
      value: true,
    })
    await upgradeMonorepo({ outDir, overwrite: true })

    const content = await fs.readFile(licensePath, 'utf8')
    expect(content).toBe('# custom license\n')
    expect(checkboxMock).not.toHaveBeenCalled()

    await fs.remove(root)
  })

  it('honors skipOverwrite for existing files', async () => {
    const checkboxMock = vi.fn(async () => [])
    const { root, outDir } = await createTempOutDir('monorepo-upgrade-skip-')

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
    await fs.remove(root)
  })

  it('force-overwrites a custom release workflow without changing other no-overwrite assets', async () => {
    const { root, outDir } = await createTempOutDir('monorepo-upgrade-release-')
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

    await upgradeMonorepo({ outDir, yes: true, overwriteRelease: true })

    const workflow = await fs.readFile(workflowPath, 'utf8')
    expect(workflow).toContain('# repoctl-managed: release/v2')
    expect(workflow).not.toContain('detect-release-trigger:')
    expect(workflow).toContain('run: pnpm exec repo release ci')
    await fs.remove(root)
  })

  it.skipIf(CI.isCI)('prompts when contents differ and rewrites selected files', async () => {
    const { root, outDir } = await createTempOutDir('monorepo-upgrade-rewrite-')
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
    Object.defineProperty(process.stdin, 'isTTY', {
      configurable: true,
      value: true,
    })
    Object.defineProperty(process.stdout, 'isTTY', {
      configurable: true,
      value: true,
    })
    await upgradeMonorepo({ outDir })
    expect(checkboxMock).toHaveBeenCalledTimes(1)
    const rewritten = await fs.readFile(targetFile, 'utf8')
    expect(rewritten).toBe(reference)

    await upgradeMonorepo({ outDir })
    expect(checkboxMock).toHaveBeenCalledTimes(1)

    await fs.remove(root)
  })

  it.skipIf(CI.isCI).each(['option', 'config'])('supports interactive selection from %s without legacy config migration', async (source) => {
    const checkboxMock = vi.fn(async (options: { message?: string, choices?: Array<{ value: string }> }) => {
      if (options?.message === '选择你需要的文件') {
        return ['.changeset']
      }
      const choices = Array.isArray(options?.choices) ? options.choices : []
      const first = choices[0]
      return first ? [first.value] : []
    })
    class GitClientMock {
      async getRepoName() {
        return 'ice/awesome'
      }
    }
    const { root, outDir } = await createTempOutDir('monorepo-upgrade-interactive-')
    if (source === 'config') {
      await fs.writeFile(path.join(root, 'repoctl.config.mjs'), 'export default {commands:{upgrade:{interactive:true}}}')
    }

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
    Object.defineProperty(process.stdin, 'isTTY', {
      configurable: true,
      value: true,
    })
    Object.defineProperty(process.stdout, 'isTTY', {
      configurable: true,
      value: true,
    })
    await upgradeMonorepo({ cwd: root, outDir, ...(source === 'option' ? { interactive: true } : {}) })

    const configPath = path.join(outDir, '.changeset/config.json')
    expect(await fs.pathExists(configPath)).toBe(false)
    expect(checkboxMock).toHaveBeenCalled()

    await fs.remove(root)
  })
})
