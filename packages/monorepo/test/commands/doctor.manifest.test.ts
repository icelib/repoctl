import { tmpdir } from 'node:os'
import path from 'pathe'
import { describe, expect, it } from 'vitest'
import { runDoctor } from '@/commands/doctor'
import fs from '@/utils/fs'

describe('doctor workspace manifest diagnostics', () => {
  it('reports malformed workspace manifests without rejecting', async () => {
    const workspaceDir = await fs.mkdtemp(path.join(tmpdir(), 'monorepo-doctor-malformed-workspace-'))
    await fs.writeFile(path.join(workspaceDir, 'pnpm-workspace.yaml'), 'packages: [\n')
    await fs.writeJSON(path.join(workspaceDir, 'package.json'), {
      name: 'malformed-workspace',
      devDependencies: { repoctl: '^5.1.0' },
    })

    try {
      const report = await runDoctor(workspaceDir)
      const workspaceCheck = report.checks.find(check => check.id === 'workspace-manifest')

      expect(report).toMatchObject({
        packageCount: 0,
        summary: expect.objectContaining({ fail: expect.any(Number) }),
      })
      expect(workspaceCheck).toMatchObject({
        id: 'workspace-manifest',
        status: 'fail',
      })
      expect(workspaceCheck?.detail).toMatch(/pnpm-workspace\.yaml is invalid/i)

      const { createDoctorReportOutput } = await import('@/cli/commands/doctor/output')
      expect(JSON.parse(createDoctorReportOutput(report, { json: true }))).toMatchObject({
        checks: expect.arrayContaining([
          expect.objectContaining({ id: 'workspace-manifest', status: 'fail' }),
        ]),
      })
      expect(createDoctorReportOutput(report, { markdown: true })).toContain('- fail: pnpm workspace')
    }
    finally {
      await fs.remove(workspaceDir)
    }
  })

  it.each([
    ['packages: false\n', 'pnpm-workspace.yaml packages must be an array of strings.'],
    ['packages:\n  - 42\n', 'pnpm-workspace.yaml packages must be an array of strings.'],
    ['- packages/**\n', 'pnpm-workspace.yaml must contain a mapping.'],
    ['packages:\n  - "packages/["\n', 'Invalid pnpm workspace pattern'],
  ])('reports semantically invalid workspace patterns as a stable diagnostic: %s', async (workspaceContent, expectedDetail) => {
    const workspaceDir = await fs.mkdtemp(path.join(tmpdir(), 'monorepo-doctor-invalid-patterns-'))
    await fs.writeJSON(path.join(workspaceDir, 'package.json'), {
      name: 'invalid-workspace-patterns',
      private: true,
    })
    await fs.writeFile(path.join(workspaceDir, 'pnpm-workspace.yaml'), workspaceContent)

    try {
      const report = await runDoctor(workspaceDir)
      const workspaceCheck = report.checks.find(check => check.id === 'workspace-manifest')
      expect(workspaceCheck).toMatchObject({ id: 'workspace-manifest', status: 'fail' })
      expect(workspaceCheck?.detail).toContain(expectedDetail)

      const { createDoctorReportOutput } = await import('@/cli/commands/doctor/output')
      const json = JSON.parse(createDoctorReportOutput(report, { json: true }))
      expect(json.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'workspace-manifest', status: 'fail' }),
      ]))
      expect(createDoctorReportOutput(report, { markdown: true })).toContain('- fail: pnpm workspace')
    }
    finally {
      await fs.remove(workspaceDir)
    }
  })

  it('reports malformed package manifests without crashing broad discovery', async () => {
    const workspaceDir = await fs.mkdtemp(path.join(tmpdir(), 'monorepo-doctor-malformed-package-'))
    await fs.outputJson(path.join(workspaceDir, 'package.json'), {
      name: 'malformed-package-workspace',
      private: true,
      devDependencies: { repoctl: '^5.1.0' },
    })
    await fs.writeFile(path.join(workspaceDir, 'pnpm-workspace.yaml'), 'packages:\n  - modules/**\n')
    await fs.outputJson(path.join(workspaceDir, 'modules/good/package.json'), {
      name: '@fixture/good',
      private: true,
    })
    // This package is outside the configured pattern, but the doctor broad
    // discovery pass still sees it while checking arbitrary workspace dirs.
    await fs.outputFile(path.join(workspaceDir, 'junk/package.json'), '{broken')

    try {
      const report = await runDoctor(workspaceDir)
      expect(report.packageCount).toBe(1)
      expect(report.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'workspace-package-discovery', status: 'fail' }),
      ]))
      expect(report.summary.fail).toBeGreaterThan(0)
    }
    finally {
      await fs.remove(workspaceDir)
    }
  })

  it('reports a malformed root package.json without dropping workspace checks', async () => {
    const workspaceDir = await fs.mkdtemp(path.join(tmpdir(), 'monorepo-doctor-malformed-root-'))
    await fs.writeFile(path.join(workspaceDir, 'package.json'), '{broken')
    await fs.writeFile(path.join(workspaceDir, 'pnpm-workspace.yaml'), 'packages:\n  - modules/**\n')
    await fs.outputJson(path.join(workspaceDir, 'modules/good/package.json'), {
      name: '@fixture/good-root-check',
      private: true,
    })

    try {
      const report = await runDoctor(workspaceDir)
      expect(report.packageCount).toBe(1)
      expect(report.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'package-json', status: 'fail' }),
        expect.objectContaining({ id: 'workspace-manifest', status: 'pass' }),
        expect.objectContaining({ id: 'workspace-package-discovery', status: 'fail' }),
      ]))
    }
    finally {
      await fs.remove(workspaceDir)
    }
  })

  it('keeps valid packages when a configured pattern also contains a malformed manifest', async () => {
    const workspaceDir = await fs.mkdtemp(path.join(tmpdir(), 'monorepo-doctor-partial-discovery-'))
    await fs.outputJson(path.join(workspaceDir, 'package.json'), {
      name: 'partial-discovery-workspace',
      private: true,
    })
    await fs.writeFile(path.join(workspaceDir, 'pnpm-workspace.yaml'), 'packages:\n  - modules/**\n')
    await fs.outputJson(path.join(workspaceDir, 'modules/good/package.json'), {
      name: '@fixture/good-partial',
      private: true,
    })
    await fs.outputFile(path.join(workspaceDir, 'modules/bad/package.json'), '{broken')

    try {
      const report = await runDoctor(workspaceDir)
      expect(report.packageCount).toBe(1)
      expect(report.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'workspace-package-discovery', status: 'fail' }),
      ]))
      const discovery = report.checks.find(check => check.id === 'workspace-package-discovery')
      expect(discovery?.detail).toContain('modules/bad')
    }
    finally {
      await fs.remove(workspaceDir)
    }
  })

  it('recovers package.yaml and package.json5 manifests independently', async () => {
    const workspaceDir = await fs.mkdtemp(path.join(tmpdir(), 'monorepo-doctor-alternate-manifests-'))
    await fs.outputJson(path.join(workspaceDir, 'package.json'), {
      name: 'alternate-manifest-workspace',
      private: true,
    })
    await fs.writeFile(path.join(workspaceDir, 'pnpm-workspace.yaml'), 'packages:\n  - modules/**\n')
    await fs.outputFile(path.join(workspaceDir, 'modules/yaml/package.yaml'), 'name: \'@fixture/yaml\'\nprivate: true\n')
    await fs.outputFile(path.join(workspaceDir, 'modules/json5/package.json5'), '{broken')

    try {
      const report = await runDoctor(workspaceDir)
      expect(report.packageCount).toBe(1)
      expect(report.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'workspace-package-discovery', status: 'fail' }),
      ]))
      expect(report.checks.find(check => check.id === 'workspace-package-discovery')?.detail).toContain('modules/json5/package.json5')
    }
    finally {
      await fs.remove(workspaceDir)
    }
  })

  it.each(['null\n', '"root package must be an object"\n', '[]\n'])('reports a non-object root package.json without crashing: %s', async (packageContent) => {
    const workspaceDir = await fs.mkdtemp(path.join(tmpdir(), 'monorepo-doctor-invalid-root-shape-'))
    await fs.writeFile(path.join(workspaceDir, 'package.json'), packageContent)
    await fs.writeFile(path.join(workspaceDir, 'pnpm-workspace.yaml'), 'packages: []\n')

    try {
      const report = await runDoctor(workspaceDir)
      expect(report.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'package-json',
          status: 'fail',
          detail: expect.stringContaining('Root package.json must contain a JSON object.'),
        }),
      ]))
    }
    finally {
      await fs.remove(workspaceDir)
    }
  })

  it.each(['not semver', 123])('reports an invalid engines.node value without crashing: %s', async (nodeRange) => {
    const workspaceDir = await fs.mkdtemp(path.join(tmpdir(), 'monorepo-doctor-invalid-engine-'))
    await fs.outputJson(path.join(workspaceDir, 'package.json'), {
      name: 'invalid-engine-workspace',
      engines: { node: nodeRange },
    })
    await fs.writeFile(path.join(workspaceDir, 'pnpm-workspace.yaml'), 'packages: []\n')

    try {
      const report = await runDoctor(workspaceDir)
      expect(report.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'node-version', status: 'fail' }),
      ]))
    }
    finally {
      await fs.remove(workspaceDir)
    }
  })
})
