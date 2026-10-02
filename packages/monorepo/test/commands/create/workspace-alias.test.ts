import { lstat, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createNewProject, getWorkspacePackages, resolveCreateNewProjectPlan } from '@icebreakers/monorepo'
import path from 'pathe'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import YAML from 'yaml'
import fs from '@/utils/fs'

let root: string

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(tmpdir(), 'repoctl-create-workspace-alias-'))
  await fs.writeJson(path.join(root, 'package.json'), { name: 'workspace-fixture', private: true })
})

afterEach(async () => {
  await fs.remove(root)
})

async function snapshotWorkspace() {
  const files: Record<string, string> = {}
  async function visit(directory: string) {
    for (const entry of (await readdir(directory)).sort()) {
      const file = path.join(directory, entry)
      const relative = path.relative(root, file)
      const info = await lstat(file)
      if (info.isDirectory()) {
        files[`${relative}/`] = 'directory'
        await visit(file)
      }
      else {
        files[relative] = `${info.mode}:${(await readFile(file)).toString('base64')}`
      }
    }
  }
  await visit(root)
  return files
}

describe('built creation with aliased workspace patterns', () => {
  it('previews without writing and appends an exact path without changing the shared anchor', async () => {
    const original = [
      'workspacePatterns: &pkgs',
      '  - modules/* # shared rule',
      'packages:',
      '  # workspace selection',
      '  *pkgs # keep alias rationale',
      'otherPatterns: *pkgs',
      '',
    ].join('\n')
    const manifestPath = path.join(root, 'pnpm-workspace.yaml')
    await fs.writeFile(manifestPath, original)
    const before = await snapshotWorkspace()
    const options = { cwd: root, name: 'services/platform/api', type: 'tsdown' }

    const plan = await resolveCreateNewProjectPlan(options)

    expect(plan.workspaceManifest).toMatchObject({ changed: true, pattern: 'services/platform/api' })
    expect(await snapshotWorkspace()).toEqual(before)

    await createNewProject(options)

    const content = await fs.readFile(manifestPath, 'utf8')
    const document = YAML.parseDocument(content)
    expect(document.toJS()).toEqual({
      workspacePatterns: ['modules/*'],
      packages: ['modules/*', 'services/platform/api'],
      otherPatterns: ['modules/*'],
    })
    expect(document.get('workspacePatterns', true)).toMatchObject({ anchor: 'pkgs' })
    expect(document.get('otherPatterns', true)).toMatchObject({ source: 'pkgs' })
    for (const comment of ['# shared rule', '# workspace selection', '# keep alias rationale']) {
      expect(content).toContain(comment)
    }
    expect((await getWorkspacePackages(root, { ignorePrivatePackage: false })).map(pkg => pkg.manifest.name)).toEqual(['api'])
    const created = await snapshotWorkspace()
    expect((await resolveCreateNewProjectPlan(options)).workspaceManifest.changed).toBe(false)
    expect(await snapshotWorkspace()).toEqual(created)
  })

  it('preserves an already covering alias byte for byte through preview and creation', async () => {
    const original = 'workspacePatterns: &pkgs [services/**]\npackages: *pkgs # keep alias\notherPatterns: *pkgs\n'
    const manifestPath = path.join(root, 'pnpm-workspace.yaml')
    await fs.writeFile(manifestPath, original)
    const before = await snapshotWorkspace()
    const options = { cwd: root, name: 'services/platform/api', type: 'tsdown' }

    expect((await resolveCreateNewProjectPlan(options)).workspaceManifest.changed).toBe(false)
    expect(await snapshotWorkspace()).toEqual(before)

    await createNewProject(options)

    expect(await fs.readFile(manifestPath, 'utf8')).toBe(original)
    expect((await getWorkspacePackages(root, { ignorePrivatePackage: false })).map(pkg => pkg.manifest.name)).toEqual(['api'])
  })
})
