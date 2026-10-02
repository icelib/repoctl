import { realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'pathe'
import { describe, expect, it } from 'vitest'
import fs from '@/utils/fs'

async function createTempWorkspace(prefix: string) {
  return fs.mkdtemp(path.join(tmpdir(), prefix))
}

describe('runDoctor', () => {
  it('reports the managed release contract', async () => {
    const workspaceDir = await createTempWorkspace('monorepo-doctor-release-')
    await fs.ensureDir(path.join(workspaceDir, '.github/workflows'))
    await fs.writeFile(path.join(workspaceDir, 'pnpm-workspace.yaml'), [
      'packages:',
      '  - packages/*',
      'versioning:',
      '  fixed:',
      '    - [repoctl]',
      '  changelog:',
      '    storage: repository',
    ].join('\n'))
    await fs.writeJSON(path.join(workspaceDir, 'package.json'), {
      name: 'release-workspace',
      devDependencies: { repoctl: '^5.1.0' },
    })
    await fs.writeFile(path.join(workspaceDir, '.github/workflows/release.yml'), '# repoctl-managed: release/v2\nname: Release\n')

    const { runDoctor } = await import('@/commands/doctor')
    const report = await runDoctor(workspaceDir)

    expect(report.checks.find(check => check.id === 'release-workflow')?.status).toBe('pass')
    expect(report.checks.find(check => check.id === 'release-cli-version')?.status).toBe('pass')
    expect(report.checks.find(check => check.id === 'release-versioning-config')?.status).toBe('pass')

    await fs.remove(workspaceDir)
  })

  it('reports workspace protocol CLI versions without crashing', async () => {
    const workspaceDir = await createTempWorkspace('monorepo-doctor-workspace-version-')
    await fs.ensureDir(path.join(workspaceDir, '.github/workflows'))
    await fs.writeFile(path.join(workspaceDir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
    await fs.writeJSON(path.join(workspaceDir, 'package.json'), {
      name: 'release-workspace',
      devDependencies: { repoctl: 'workspace:*' },
    })
    await fs.writeFile(path.join(workspaceDir, '.github/workflows/release.yml'), '# repoctl-managed: release/v2\nname: Release\n')

    const { runDoctor } = await import('@/commands/doctor')
    const report = await runDoctor(workspaceDir)

    expect(report.checks.find(check => check.id === 'release-cli-version')).toMatchObject({
      status: 'warn',
      detail: 'repoctl workspace:* does not guarantee release ci support.',
    })

    await fs.remove(workspaceDir)
  })

  it('accepts independent versioning without fixed groups', async () => {
    const workspaceDir = await createTempWorkspace('monorepo-doctor-independent-versioning-')
    await fs.ensureDir(path.join(workspaceDir, '.github/workflows'))
    await fs.writeFile(path.join(workspaceDir, 'pnpm-workspace.yaml'), [
      'packages:',
      '  - packages/*',
      'versioning:',
      '  changelog:',
      '    storage: repository',
    ].join('\n'))
    await fs.writeJSON(path.join(workspaceDir, 'package.json'), {
      name: 'release-workspace',
      devDependencies: { repoctl: '^5.1.0' },
    })
    await fs.writeFile(path.join(workspaceDir, '.github/workflows/release.yml'), '# repoctl-managed: release/v2\nname: Release\n')

    const { runDoctor } = await import('@/commands/doctor')
    const report = await runDoctor(workspaceDir)

    expect(report.checks.find(check => check.id === 'release-versioning-config')?.status).toBe('pass')

    await fs.remove(workspaceDir)
  })

  it('warns when fixed groups are malformed', async () => {
    const workspaceDir = await createTempWorkspace('monorepo-doctor-invalid-fixed-')
    await fs.ensureDir(path.join(workspaceDir, '.github/workflows'))
    await fs.writeFile(path.join(workspaceDir, 'pnpm-workspace.yaml'), [
      'packages:',
      '  - packages/*',
      'versioning:',
      '  fixed:',
      '    - []',
      '  changelog:',
      '    storage: repository',
    ].join('\n'))
    await fs.writeJSON(path.join(workspaceDir, 'package.json'), {
      name: 'release-workspace',
      devDependencies: { repoctl: '^5.1.0' },
    })
    await fs.writeFile(path.join(workspaceDir, '.github/workflows/release.yml'), '# repoctl-managed: release/v2\nname: Release\n')

    const { runDoctor } = await import('@/commands/doctor')
    const report = await runDoctor(workspaceDir)

    expect(report.checks.find(check => check.id === 'release-versioning-config')?.status).toBe('warn')

    await fs.remove(workspaceDir)
  })

  it('reports a healthy workspace with the recommended quick scripts', async () => {
    const workspaceDir = await createTempWorkspace('monorepo-doctor-pass-')
    const pkgDir = path.join(workspaceDir, 'packages/demo')

    await fs.ensureDir(pkgDir)
    await fs.ensureDir(path.join(workspaceDir, '.husky'))
    await fs.writeFile(path.join(workspaceDir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
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
    await fs.writeJSON(path.join(pkgDir, 'package.json'), {
      name: '@demo/app',
      version: '0.0.0',
    }, { spaces: 2 })
    await fs.writeFile(path.join(workspaceDir, 'repoctl.config.ts'), 'export default {}\n')
    await fs.writeFile(path.join(workspaceDir, '.husky/pre-commit'), 'pnpm exec lint-staged\n')
    await fs.writeFile(path.join(workspaceDir, 'lint-staged.config.js'), 'export default {}\n')

    const { runDoctor } = await import('@/commands/doctor')
    const report = await runDoctor(pkgDir)
    const normalizedWorkspaceDir = await realpath(workspaceDir)

    expect(report.workspaceDir).toBe(normalizedWorkspaceDir)
    expect(report.packageCount).toBe(1)
    expect(report.summary).toEqual({
      pass: 10,
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
      version: '0.0.0',
    }, { spaces: 2 })
    await fs.writeFile(path.join(workspaceDir, 'repoctl.config.ts'), 'export default {}\n')
    await fs.writeFile(path.join(workspaceDir, '.husky/pre-commit'), 'pnpm exec lint-staged\n')
    await fs.writeFile(path.join(workspaceDir, 'lint-staged.config.js'), 'export default {}\n')

    const { runDoctor } = await import('@/commands/doctor')
    const report = await runDoctor(pkgDir)

    expect(report.summary).toEqual({
      pass: 10,
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
      pass: 5,
      warn: 2,
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
})
