import { tmpdir } from 'node:os'
import path from 'pathe'
import { describe, expect, it } from 'vitest'
import fs from '@/utils/fs'

async function createTempWorkspace(prefix: string) {
  return fs.mkdtemp(path.join(tmpdir(), prefix))
}

describe('doctor tooling discovery', () => {
  it('detects legacy local tooling loader imports', async () => {
    const workspaceDir = await createTempWorkspace('monorepo-doctor-legacy-tooling-')
    const appDir = path.join(workspaceDir, 'apps/web')

    await fs.ensureDir(appDir)
    await fs.writeFile(path.join(workspaceDir, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n  - packages/*\n  - examples/*\n')
    await fs.writeJSON(path.join(workspaceDir, 'package.json'), {
      name: 'demo-workspace',
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

  it('detects legacy tooling in packages under custom workspace directories', async () => {
    const workspaceDir = await createTempWorkspace('monorepo-doctor-custom-tooling-')
    const packageDir = path.join(workspaceDir, 'modules/custom')

    await fs.ensureDir(packageDir)
    await fs.writeFile(path.join(workspaceDir, 'pnpm-workspace.yaml'), 'packages:\n  - modules/**\n')
    await fs.writeJSON(path.join(workspaceDir, 'package.json'), {
      name: 'custom-layout-workspace',
      engines: { node: '>=0' },
      devDependencies: { repoctl: '^3.0.0' },
      scripts: {
        'repo:init': 'repo init',
        'repo:new': 'repo new',
        'repo:check': 'repo check',
        'repo:doctor': 'repo doctor',
      },
    }, { spaces: 2 })
    await fs.writeJSON(path.join(packageDir, 'package.json'), { name: '@demo/custom' }, { spaces: 2 })
    await fs.writeFile(path.join(packageDir, 'eslint.config.js'), [
      'import { loadRepoctlToolingModule } from \'../../tooling/load-tooling-module.mjs\'',
      'const { defineEslintConfig } = await loadRepoctlToolingModule()',
      'export default await defineEslintConfig()',
      '',
    ].join('\n'))

    const { runDoctor } = await import('@/commands/doctor')
    const report = await runDoctor(workspaceDir)
    const toolingCheck = report.checks.find(check => check.id === 'tooling-imports')

    expect(toolingCheck?.status).toBe('warn')
    expect(toolingCheck?.detail).toContain('modules/custom/eslint.config.js')

    await fs.remove(workspaceDir)
  })
})
