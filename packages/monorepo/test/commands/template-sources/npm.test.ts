import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { cli, exists, json, loadRepo, npmFixture } from './fixtures'

let repo: Awaited<ReturnType<typeof loadRepo>>
beforeAll(async () => {
  repo = await loadRepo()
}, 30_000)

describe('fixed npm template assets', () => {
  it('keeps discovery and plans read-only, then fetches, records identity, and creates offline', async () => {
    const fixture = await npmFixture()
    const options = { cwd: fixture.cwd, cacheDir: fixture.cacheDir }
    const catalog = await repo.resolveTemplateCatalog(options)
    expect(catalog.entries.find(entry => entry.key === 'custom')?.remote).toEqual(fixture.remote)
    await expect(repo.resolveCreateNewProjectPlan({ ...options, type: 'custom', name: 'packages/first' })).rejects.toThrow('verified cache')
    expect(fixture.state.requests).toBe(0)
    expect(await readdir(fixture.root)).not.toContain('cache')
    const fetched = await cli(fixture.cwd, ['templates', 'fetch', 'custom', '--json'])
    expect(fetched.exitCode, fetched.stdout + fetched.stderr).toBe(0)
    expect(JSON.parse(fetched.stdout)).toMatchObject({ cache: 'downloaded', resolved: { kind: 'npm', packageName: '@fixtures/templates', requestedVersion: '1.2.3', version: '1.2.3' } })
    expect(fixture.state.auth.every(auth => auth === `Bearer ${fixture.token}`)).toBe(true)
    const requests = fixture.state.requests
    fixture.state.rejectAuth = true
    const plan = await repo.resolveCreateNewProjectPlan({ ...options, type: 'custom', name: 'packages/first' })
    expect(plan.sourceResolution?.resolved).toMatchObject({ version: '1.2.3' })
    expect(await readdir(fixture.cwd)).not.toContain('packages')
    await repo.createNewProject({ ...options, type: 'custom', name: 'packages/first', offline: true })
    const registry = await json(path.join(fixture.cwd, '.repoctl/template-instances.json'))
    expect(registry.instances[0].source).toMatchObject({ kind: 'remote', templatePath: 'templates/sample', remote: { kind: 'npm', version: '1.2.3', integrity: fixture.state.integrity } })
    expect(JSON.stringify(registry)).not.toContain(fixture.token)
    expect(await exists(fixture.scriptMarker)).toBe(false)
    expect(fixture.state.requests).toBe(requests)
    const health = await repo.checkTemplates(options)
    expect(health.checks.filter(check => check.template === 'custom').every(check => check.status === 'pass')).toBe(true)
    await expect(repo.planTemplateUpgrade({ cwd: fixture.cwd, instance: 'packages/first', version: '2.0.0' })).rejects.toThrow('Remote source identity')
  }, 60_000)

  it('runs the same author validation and actual tarball consumption for a fetched source', async () => {
    const fixture = await npmFixture()
    const report = await repo.validateTemplate({ cwd: fixture.cwd, template: 'custom', fixtureDir: fixture.fixtureDir, cacheDir: fixture.cacheDir })
    expect(report.status, JSON.stringify(report)).toBe('passed')
    expect(report.plan.sourceResolution?.resolved).toMatchObject({ version: '1.2.3' })
    expect(report.samples[0]?.artifact?.packages[0]?.status).toBe('passed')
    expect(await exists(fixture.scriptMarker)).toBe(false)
  }, 90_000)

  it('refuses altered cache files before creating a target', async () => {
    const fixture = await npmFixture()
    const fetched = await repo.resolveRemoteTemplateSource(fixture.remote, 'templates/sample', fixture)
    await writeFile(path.join(fetched.sourceDir, 'index.js'), 'export const value = "tampered"')
    await expect(repo.createNewProject({ cwd: fixture.cwd, type: 'custom', name: 'packages/changed', offline: true })).rejects.toThrow('integrity verification')
    expect(await exists(path.join(fixture.cwd, 'packages/changed/package.json'))).toBe(false)
    expect(await readFile(path.join(fixture.cwd, 'pnpm-workspace.yaml'), 'utf8')).toBe('packages:\n  - packages/*\n')
  })
})
