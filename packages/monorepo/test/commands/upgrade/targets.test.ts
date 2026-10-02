import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { resolveUpgradePlan, upgradeMonorepo } from '@icebreakers/monorepo'
import { afterEach, describe, expect, it } from 'vitest'

const roots: string[] = []
const workflowPath = '.github/workflows/release.yml'
const workspacePath = 'pnpm-workspace.yaml'
const packagePath = 'package.json'
const targets = [workflowPath, workspacePath, packagePath]
const legacyPaths = ['.changeset/config.json', '.changeset/pre.json']

async function createWorkspace(omittedTarget: string, managedWorkflow = false) {
  const cwd = await mkdtemp(path.join(tmpdir(), 'repoctl-upgrade-targets-'))
  roots.push(cwd)
  const files: Record<string, string> = {
    [packagePath]: JSON.stringify({ name: 'root', private: true, devDependencies: { '@changesets/cli': '^2.0.0' } }),
    [workspacePath]: 'packages:\n  - packages/*\n',
    [workflowPath]: managedWorkflow
      ? '# repoctl-managed: release/v2\nname: Preserved managed workflow\njobs: {}\n'
      : 'uses: changesets/action\nrun: changeset publish\n',
    '.changeset/config.json': '{"changelog":false}',
    '.changeset/pre.json': '{"mode":"pre","tag":"beta"}',
    'packages/demo/package.json': '{"name":"demo","version":"1.0.0"}',
    'repoctl.config.mjs': `export default ${JSON.stringify({ commands: { upgrade: {
      targets: targets.filter(target => target !== omittedTarget),
      mergeTargets: false,
    } } })}`,
  }
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(cwd, relativePath)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, content)
  }
  return { cwd, files }
}

async function snapshot(cwd: string, relativePath = ''): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  for (const entry of await readdir(path.join(cwd, relativePath), { withFileTypes: true })) {
    const key = path.posix.join(relativePath, entry.name)
    if (entry.isDirectory()) {
      result[`${key}/`] = ''
      Object.assign(result, await snapshot(cwd, key))
    }
    else {
      result[key] = (await readFile(path.join(cwd, key))).toString('base64')
    }
  }
  return result
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('built upgrade migration target selection', () => {
  it.each(targets)('preserves legacy release state when required target %s is excluded', async (omittedTarget) => {
    const { cwd, files } = await createWorkspace(omittedTarget)
    const before = await snapshot(cwd)

    const plan = await resolveUpgradePlan({ cwd, yes: true })

    for (const legacyPath of legacyPaths) {
      expect(plan.files).toContainEqual(expect.objectContaining({
        path: legacyPath,
        action: 'skip',
        reason: 'migration-targets-not-selected',
      }))
    }
    expect(plan.files.some(file => file.path === omittedTarget)).toBe(false)
    expect(await snapshot(cwd)).toEqual(before)

    await upgradeMonorepo({ cwd, yes: true })

    for (const relativePath of [omittedTarget, workflowPath, ...legacyPaths]) {
      expect(await readFile(path.join(cwd, relativePath), 'utf8')).toBe(files[relativePath])
    }
    const manifest = JSON.parse(await readFile(path.join(cwd, packagePath), 'utf8'))
    expect(manifest.devDependencies['@changesets/cli']).toBe('^2.0.0')
  })

  it('uses an unselected managed workflow as a read-only migration dependency', async () => {
    const { cwd, files } = await createWorkspace(workflowPath, true)
    const before = await snapshot(cwd)

    const plan = await resolveUpgradePlan({ cwd, yes: true })

    expect(plan.files).toContainEqual(expect.objectContaining({ path: workflowPath, action: 'skip', reason: 'identical' }))
    for (const legacyPath of legacyPaths) {
      expect(plan.files).toContainEqual(expect.objectContaining({
        path: legacyPath,
        action: 'delete',
        dependsOn: expect.arrayContaining([workflowPath, workspacePath, packagePath]),
      }))
    }
    expect(await snapshot(cwd)).toEqual(before)

    await upgradeMonorepo({ cwd, yes: true })

    expect(await readFile(path.join(cwd, workflowPath), 'utf8')).toBe(files[workflowPath])
    expect(await readFile(path.join(cwd, workspacePath), 'utf8')).toContain('demo: beta')
    const manifest = JSON.parse(await readFile(path.join(cwd, packagePath), 'utf8'))
    expect(manifest.devDependencies['@changesets/cli']).toBeUndefined()
    for (const legacyPath of legacyPaths) {
      await expect(readFile(path.join(cwd, legacyPath))).rejects.toMatchObject({ code: 'ENOENT' })
    }
  })
})
