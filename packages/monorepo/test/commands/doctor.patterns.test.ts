import { tmpdir } from 'node:os'
import path from 'pathe'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { runDoctor } from '@/commands/doctor'
import fs from '@/utils/fs'

let root: string

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(tmpdir(), 'repoctl-doctor-patterns-'))
  await fs.outputJson(path.join(root, 'package.json'), { name: 'workspace', private: true })
})

afterEach(async () => {
  await fs.remove(root)
})

async function setup(patterns: string[], directories: string[]) {
  await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), YAML.stringify({ packages: patterns }))
  for (const [index, directory] of directories.entries()) {
    await fs.outputJson(path.join(root, directory, 'package.json'), { name: `package-${index}`, version: '1.0.0' })
  }
}

function workspaceChecks(report: Awaited<ReturnType<typeof runDoctor>>) {
  return report.checks.filter(check => ['workspace-patterns', 'workspace-package-coverage'].includes(check.id))
}

describe('doctor workspace coverage', () => {
  it.each(['apps/**', '{apps,packages}/**', 'apps/+(platform|other)/**', '!(examples)/**'])('recognizes the pnpm glob %s', async (pattern) => {
    await setup([pattern], ['apps/platform/web/client'])
    const report = await runDoctor(root)
    expect(report.packageCount).toBe(1)
    expect(workspaceChecks(report).every(check => check.status === 'pass')).toBe(true)
  })

  it('respects exclusions without recommending their accidental inclusion', async () => {
    await setup(['apps/**', '!apps/private/**'], ['apps/client', 'apps/private/internal'])
    const report = await runDoctor(root)
    expect(report.packageCount).toBe(1)
    expect(workspaceChecks(report).every(check => check.status === 'pass')).toBe(true)
  })

  it('reports uncovered deep packages', async () => {
    await setup(['apps/*'], ['apps/platform/web/client'])
    const report = await runDoctor(root)
    expect(report.packageCount).toBe(0)
    expect(workspaceChecks(report).every(check => check.status === 'warn' && check.detail.includes('apps/platform/web/client'))).toBe(true)
  })

  it('reports uncovered packages outside conventional workspace directories', async () => {
    await setup(['apps/*'], ['modules/platform/client'])
    const report = await runDoctor(root)
    expect(report.packageCount).toBe(0)
    expect(workspaceChecks(report).every(check => check.status === 'warn' && check.detail.includes('modules/platform/client'))).toBe(true)
  })

  it('accepts exact package paths and nonconventional configured directories', async () => {
    await setup(['single', 'services/**'], ['single', 'services/http'])
    const report = await runDoctor(root)
    expect(report.packageCount).toBe(2)
    expect(workspaceChecks(report).every(check => check.status === 'pass')).toBe(true)
  })

  it.each(['', 'catalog: {}\n'])('uses pnpm defaults when packages is absent: %s', async (manifest) => {
    await setup([], ['apps/deep/client'])
    await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), manifest)
    const report = await runDoctor(root)
    expect(report.packageCount).toBe(1)
    expect(workspaceChecks(report).every(check => check.status === 'pass')).toBe(true)
  })

  it('keeps an explicit empty packages list empty', async () => {
    await setup([], ['apps/deep/client'])
    const report = await runDoctor(root)
    expect(report.packageCount).toBe(0)
    expect(workspaceChecks(report).every(check => check.status === 'warn')).toBe(true)
  })

  it('does not mistake exclusion-only patterns for an inclusion', async () => {
    await setup(['!apps/private/**'], ['apps/client'])
    const report = await runDoctor(root)
    expect(report.packageCount).toBe(0)
    expect(workspaceChecks(report).every(check => check.status === 'warn')).toBe(true)
  })

  it('reports malformed workspace globs as a manifest failure', async () => {
    await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages: ["["]\n')
    const report = await runDoctor(root)
    const workspaceCheck = report.checks.find(check => check.id === 'workspace-manifest')
    expect(workspaceCheck).toMatchObject({ status: 'fail' })
    expect(workspaceCheck?.detail).toContain('Invalid pnpm workspace pattern')
  })
})
