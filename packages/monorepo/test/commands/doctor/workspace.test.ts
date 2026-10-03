import { realpath } from 'node:fs/promises'
import path from 'pathe'
import { describe, expect, it, vi } from 'vitest'
import fs from '@/utils/fs'
import { createTempWorkspace, recordInstallation } from './helpers'

vi.mock('@/utils/pnpm-runtime', () => ({
  inspectPnpmRuntime: async () => ({ state: 'observed', version: '12.8.1', source: 'test' }),
}))

describe('runDoctor', () => {
  it('reports a healthy workspace with the recommended quick scripts', async () => {
    const workspaceDir = await createTempWorkspace('monorepo-doctor-pass-')
    const pkgDir = path.join(workspaceDir, 'packages/demo')

    await fs.ensureDir(pkgDir)
    await fs.ensureDir(path.join(workspaceDir, '.husky'))
    await fs.writeFile(path.join(workspaceDir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
    await fs.writeJSON(path.join(workspaceDir, 'package.json'), {
      name: 'demo-workspace',
      private: true,
      engines: { node: '>=0' },
      devDependencies: {
        repoctl: '^3.0.0',
      },
      scripts: {
        'repo:init': 'repo init',
        'repo:new': 'repo new',
        'repo:check': 'repo check',
        'repo:doctor': 'repo doctor',
      },
    }, { spaces: 2 })
    await fs.writeJSON(path.join(pkgDir, 'package.json'), {
      name: '@demo/app',
      private: true,
      version: '0.0.0',
    }, { spaces: 2 })
    await fs.writeFile(path.join(workspaceDir, 'repoctl.config.ts'), 'export default {}\n')
    await fs.writeFile(path.join(workspaceDir, '.husky/pre-commit'), 'pnpm exec lint-staged\n')
    await fs.writeFile(path.join(workspaceDir, 'lint-staged.config.js'), 'export default {}\n')

    await recordInstallation(workspaceDir)
    const { runDoctor } = await import('@/commands/doctor')
    const report = await runDoctor(pkgDir)
    const normalizedWorkspaceDir = await realpath(workspaceDir)

    expect(report.workspaceDir).toBe(normalizedWorkspaceDir)
    expect(report.packageCount).toBe(1)
    expect(report.summary).toEqual({
      pass: 20,
      warn: 0,
      fail: 0,
    })
    expect(report.checks.find(check => check.id === 'workspace-patterns')?.status).toBe('pass')
    expect(report.checks.find(check => check.id === 'tool-package')?.detail).toContain('repoctl@^3.0.0')
    expect(report.checks.find(check => check.id === 'root-scripts')?.detail).toContain('repo:doctor')

    await fs.remove(workspaceDir)
  })

  it('reports zero warnings after setup-style workspace patterns are present', async () => {
    const workspaceDir = await createTempWorkspace('monorepo-doctor-clean-')
    const pkgDir = path.join(workspaceDir, 'packages/demo')

    await fs.ensureDir(pkgDir)
    await fs.ensureDir(path.join(workspaceDir, '.husky'))
    await fs.writeFile(path.join(workspaceDir, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n  - packages/*\n  - examples/*\n')
    await fs.writeJSON(path.join(workspaceDir, 'package.json'), {
      name: 'demo-workspace',
      private: true,
      engines: { node: '>=0' },
      devDependencies: {
        repoctl: '^3.0.0',
      },
      scripts: {
        'repo:init': 'repo init',
        'repo:new': 'repo new',
        'repo:check': 'repo check',
        'repo:doctor': 'repo doctor',
      },
    }, { spaces: 2 })
    await fs.writeJSON(path.join(pkgDir, 'package.json'), {
      name: '@demo/app',
      private: true,
      version: '0.0.0',
    }, { spaces: 2 })
    await fs.writeFile(path.join(workspaceDir, 'repoctl.config.ts'), 'export default {}\n')
    await fs.writeFile(path.join(workspaceDir, '.husky/pre-commit'), 'pnpm exec lint-staged\n')
    await fs.writeFile(path.join(workspaceDir, 'lint-staged.config.js'), 'export default {}\n')

    await recordInstallation(workspaceDir)
    const { runDoctor } = await import('@/commands/doctor')
    const report = await runDoctor(pkgDir)

    expect(report.summary).toEqual({
      pass: 20,
      warn: 0,
      fail: 0,
    })
    expect(report.checks.find(check => check.id === 'tool-package')?.detail).toContain('repoctl@^3.0.0')
    expect(report.checks.find(check => check.id === 'root-scripts')?.detail).toContain('repo:doctor')

    await fs.remove(workspaceDir)
  })

  it('accepts repo-prefixed scripts', async () => {
    const workspaceDir = await createTempWorkspace('monorepo-doctor-repo-scripts-')

    await fs.ensureDir(path.join(workspaceDir, '.husky'))
    await fs.writeFile(path.join(workspaceDir, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n  - packages/*\n  - examples/*\n')
    await fs.writeJSON(path.join(workspaceDir, 'package.json'), {
      name: 'repo-script-workspace',
      engines: { node: '>=0' },
      devDependencies: {
        repoctl: '^4.0.5',
      },
      scripts: {
        'repo:init': 'repo init',
        'repo:new': 'repo new',
        'repo:check': 'repo check',
        'repo:doctor': 'repo doctor',
      },
    }, { spaces: 2 })
    await fs.writeFile(path.join(workspaceDir, 'repoctl.config.ts'), 'export default {}\n')
    await fs.writeFile(path.join(workspaceDir, '.husky/pre-commit'), 'pnpm exec lint-staged\n')
    await fs.writeFile(path.join(workspaceDir, 'lint-staged.config.js'), 'export default {}\n')

    const { runDoctor } = await import('@/commands/doctor')
    const report = await runDoctor(workspaceDir)

    expect(report.checks.find(check => check.id === 'root-scripts')?.status).toBe('pass')

    await fs.remove(workspaceDir)
  })

  it('flags blocking issues and partial onboarding state', async () => {
    const workspaceDir = await createTempWorkspace('monorepo-doctor-fail-')

    await fs.ensureDir(path.join(workspaceDir, '.husky'))
    await fs.writeFile(path.join(workspaceDir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
    await fs.writeJSON(path.join(workspaceDir, 'package.json'), {
      name: 'broken-workspace',
      private: true,
      engines: { node: '>=999.0.0' },
      scripts: {
        setup: 'repo init',
      },
    }, { spaces: 2 })
    await fs.writeFile(path.join(workspaceDir, 'repoctl.config.ts'), 'export default {}\n')
    await fs.writeFile(path.join(workspaceDir, 'monorepo.config.ts'), 'export default {}\n')
    await fs.writeFile(path.join(workspaceDir, '.husky/pre-commit'), 'pnpm exec lint-staged\n')

    const { runDoctor } = await import('@/commands/doctor')
    const report = await runDoctor(workspaceDir)

    expect(report.summary).toEqual({
      pass: 11,
      warn: 6,
      fail: 3,
    })
    expect(report.checks.find(check => check.id === 'node-version')?.status).toBe('fail')
    expect(report.checks.find(check => check.id === 'tool-package')?.status).toBe('fail')
    expect(report.checks.find(check => check.id === 'root-scripts')?.detail).toContain('repo:init')
    expect(report.checks.find(check => check.id === 'config-file')?.status).toBe('fail')
    expect(report.checks.find(check => check.id === 'commit-hooks')?.status).toBe('warn')
    expect(report.checks.find(check => check.id === 'tooling-imports')?.status).toBe('pass')

    await fs.remove(workspaceDir)
  })

  it('detects legacy local tooling loader imports', async () => {
    const workspaceDir = await createTempWorkspace('monorepo-doctor-legacy-tooling-')
    const appDir = path.join(workspaceDir, 'apps/web')

    await fs.ensureDir(appDir)
    await fs.writeFile(path.join(workspaceDir, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n  - packages/*\n  - examples/*\n')
    await fs.writeJSON(path.join(workspaceDir, 'package.json'), {
      name: 'demo-workspace',
      private: true,
      engines: { node: '>=0' },
      devDependencies: {
        repoctl: '^3.0.0',
      },
      scripts: {
        'repo:init': 'repo init',
        'repo:new': 'repo new',
        'repo:check': 'repo check',
        'repo:doctor': 'repo doctor',
      },
    }, { spaces: 2 })
    await fs.writeJSON(path.join(appDir, 'package.json'), { name: 'web' }, { spaces: 2 })
    await fs.writeFile(path.join(workspaceDir, 'repoctl.config.ts'), 'export default {}\n')
    await fs.writeFile(path.join(workspaceDir, 'lint-staged.config.js'), 'export default {}\n')
    await fs.ensureDir(path.join(workspaceDir, '.husky'))
    await fs.writeFile(path.join(workspaceDir, '.husky/pre-commit'), 'pnpm exec lint-staged\n')
    await fs.writeFile(path.join(appDir, 'eslint.config.js'), [
      'import { loadRepoctlToolingModule } from \'../../tooling/load-tooling-module.mjs\'',
      'const { defineEslintConfig } = await loadRepoctlToolingModule()',
      'export default await defineEslintConfig()',
      '',
    ].join('\n'))
    await fs.writeFile(path.join(workspaceDir, 'stylelint.config.js'), [
      'import { icebreaker } from \'@icebreakers/stylelint-config\'',
      'export default icebreaker({})',
      '',
    ].join('\n'))

    const { runDoctor } = await import('@/commands/doctor')
    const report = await runDoctor(workspaceDir)
    const toolingCheck = report.checks.find(check => check.id === 'tooling-imports')

    expect(toolingCheck?.status).toBe('warn')
    expect(toolingCheck?.detail).toContain('stylelint.config.js')
    expect(toolingCheck?.fix).toBe('Run repo upgrade --yes to migrate to repoctl/tooling.')

    await fs.remove(workspaceDir)
  })
})
