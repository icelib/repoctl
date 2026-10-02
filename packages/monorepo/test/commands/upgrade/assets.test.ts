import path from 'pathe'
import { describe, expect, it, vi } from 'vitest'
import fs from '@/utils/fs'
import { createTempOutDir, registerUpgradeFixtureCleanup, setInteractiveTTY } from './fixtures'

const nodeModulesLinePattern = /^node_modules$/gm

registerUpgradeFixtureCleanup()

describe('upgradeMonorepo asset merging', () => {
  it('merges package.json content when it already exists', async () => {
    const checkboxMock = vi.fn(async (options: { choices?: Array<{ value: string }> }) => {
      const choices = Array.isArray(options?.choices) ? options.choices : []
      const match = choices.find(item => typeof item.value === 'string' && item.value.endsWith('package.json'))
      return match ? [match.value] : []
    })
    const { outDir } = await createTempOutDir('monorepo-upgrade-package-')
    const packagePath = path.join(outDir, 'package.json')
    await fs.writeJSON(packagePath, {
      name: 'demo-package',
      scripts: {
        test: 'vitest',
      },
    }, { spaces: 2 })

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

    const pkg = await fs.readJSON(packagePath)
    expect(pkg.scripts.commitlint).toBe('commitlint --edit')
    expect(checkboxMock).not.toHaveBeenCalled()
  })

  it('merges AGENTS.md content when it already exists', async () => {
    const checkboxMock = vi.fn(async (options: { choices?: Array<{ value: string }> }) => {
      const choices = Array.isArray(options?.choices) ? options.choices : []
      return choices.map(choice => choice.value)
    })
    const { outDir } = await createTempOutDir('monorepo-upgrade-agents-')
    const agentsPath = path.join(outDir, 'AGENTS.md')

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

    await fs.writeFile(agentsPath, [
      '# Repository Guidelines',
      '',
      '## Project Structure & Module Organization',
      '',
      'custom structure section',
      '',
      '## Team Notes',
      '',
      'team-only notes',
      '',
    ].join('\n'), 'utf8')

    await upgradeMonorepo({ outDir, overwrite: true })

    const next = await fs.readFile(agentsPath, 'utf8')
    expect(next).toContain('custom structure section')
    expect(next).toContain('## Create packages and apps')
    expect(next).toContain('## Team Notes')
    expect(next).toContain('team-only notes')
    expect(next).not.toContain('source workspace for repoctl')
  })

  it('merges .gitignore content when it already exists', async () => {
    const checkboxMock = vi.fn(async (options: { choices?: Array<{ value: string }> }) => {
      const choices = Array.isArray(options?.choices) ? options.choices : []
      return choices.map(choice => choice.value)
    })
    const { outDir } = await createTempOutDir('monorepo-upgrade-gitignore-')
    const gitignorePath = path.join(outDir, '.gitignore')

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

    await fs.writeFile(gitignorePath, [
      '# local overrides',
      'node_modules',
      '.playwright-cli',
      '',
    ].join('\n'), 'utf8')

    setInteractiveTTY()
    await upgradeMonorepo({ outDir })

    const next = await fs.readFile(gitignorePath, 'utf8')
    expect(next).toContain('# local overrides')
    expect(next).toContain('.playwright-cli')
    expect(next).toContain('.turbo')
    expect((next.match(nodeModulesLinePattern) ?? []).length).toBe(1)
  })

  it('migrates direct config package wrappers when upgrading existing tooling files', async () => {
    const { outDir } = await createTempOutDir('monorepo-upgrade-direct-tooling-')
    const packagePath = path.join(outDir, 'package.json')
    const eslintPath = path.join(outDir, 'eslint.config.js')

    await fs.writeJSON(packagePath, {
      name: 'demo-package',
      scripts: {},
    }, { spaces: 2 })
    await fs.writeFile(eslintPath, [
      'import { icebreaker as eslintConfig } from \'@icebreakers/eslint-config\'',
      '',
      'const baseOptions = { ignores: [\'dist/**\'] }',
      'const extraFlatConfigs = [{ rules: { \'no-console\': \'off\' } }]',
      '',
      'export default eslintConfig(baseOptions, ...extraFlatConfigs)',
      '',
    ].join('\n'), 'utf8')

    const { upgradeMonorepo } = await import('@/commands/upgrade')
    await upgradeMonorepo({ outDir, yes: true })

    const content = await fs.readFile(eslintPath, 'utf8')
    expect(content).toContain('import { defineEslintConfig } from \'repoctl/tooling\'')
    expect(content).toContain('export default await defineEslintConfig(baseOptions, ...extraFlatConfigs)')
    expect(content).toContain('no-console')
  })
})
