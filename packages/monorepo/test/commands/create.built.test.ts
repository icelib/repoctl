import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createNewProject, getWorkspacePackages, resolveCreateNewProjectPlan, runDoctor } from '@icebreakers/monorepo'
import path from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('built create public API', () => {
  it('previews, creates and discovers a nested package without widening workspace coverage', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'repoctl-built-create-'))
    roots.push(root)
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'workspace', private: true }))
    await writeFile(path.join(root, 'pnpm-workspace.yaml'), '# retained comment\npackages: []\n')
    const originalEntries = await readdir(root)
    const options = { cwd: root, name: 'apps/platform/client', type: 'tsdown' }
    const plan = await resolveCreateNewProjectPlan(options)
    expect(plan.workspaceManifest).toMatchObject({ changed: true, pattern: 'apps/platform/client' })
    expect(await readdir(root)).toEqual(originalEntries)
    expect((await getWorkspacePackages(root, { ignorePrivatePackage: false })).map(pkg => pkg.manifest.name)).not.toContain('client')

    await createNewProject(options)

    expect((await getWorkspacePackages(root, { ignorePrivatePackage: false })).map(pkg => pkg.manifest.name)).toContain('client')
    const manifest = await readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8')
    expect(manifest).toContain('# retained comment')
    expect(manifest).toContain('apps/platform/client')
    expect(manifest).not.toContain('apps/*')
    const report = await runDoctor(root)
    expect(report.checks.find(check => check.id === 'workspace-package-coverage')?.status).toBe('pass')
    await expect(createNewProject(options)).rejects.toThrow('Target directory already exists')
    expect(await readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8')).toBe(manifest)
  })

  it('rejects excluded targets during the built preview before any write', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'repoctl-built-create-excluded-'))
    roots.push(root)
    await writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages: ["apps/**", "!apps/private/**"]\n')
    await expect(resolveCreateNewProjectPlan({ cwd: root, name: 'apps/private/client' })).rejects.toThrow('excluded')
    expect(await readdir(root)).toEqual(['pnpm-workspace.yaml'])
  })
})
