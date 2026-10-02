import path from 'pathe'
import { describe, expect, it, vi } from 'vitest'
import fs from '@/utils/fs'
import { createTempWorkspace } from './helpers'

vi.mock('@/utils/pnpm-runtime', () => ({
  inspectPnpmRuntime: async () => ({ state: 'observed', version: '12.8.1', source: 'test' }),
}))

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
})
