import { spawnSync } from 'node:child_process'
import { link, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { applyCodeownersPlan, inspectWorkspaceOwners, loadMonorepoConfigDetails, planCodeowners } from '@icebreakers/monorepo'
import { afterEach, expect, it, vi } from 'vitest'

const roots: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function writeConfig(cwd: string, owners: unknown) {
  await writeFile(path.join(cwd, 'repoctl.config.mjs'), `export default ${JSON.stringify({ codeowners: { owners } })}`)
}

async function fixture(owners: unknown = { '@fixture/client': ['@org/ui'], 'libraries/sdk': ['@maintainer'] }) {
  const cwd = await realpath(await mkdtemp(path.join(tmpdir(), 'repoctl owners ')))
  roots.push(cwd)
  await writeFile(path.join(cwd, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n  - libraries/*\n')
  await writeFile(path.join(cwd, 'package.json'), JSON.stringify({ name: 'fixture', private: true }))
  for (const [directory, name, isPrivate] of [['apps/client one', '@fixture/client', true], ['libraries/sdk', '@fixture/sdk', false]] as const) {
    await mkdir(path.join(cwd, directory), { recursive: true })
    await writeFile(path.join(cwd, directory, 'package.json'), JSON.stringify({ name, private: isPrivate, version: '1.0.0' }))
  }
  await writeConfig(cwd, owners)
  return cwd
}

it('reports exact name/path ownership including private custom directories without remote operations', async () => {
  const cwd = await fixture()
  const spies = [vi.spyOn(http, 'request'), vi.spyOn(https, 'request'), vi.spyOn(globalThis, 'fetch')]
  const report = await inspectWorkspaceOwners({ cwd })
  expect(report.packages).toMatchObject([
    { path: 'apps/client one', private: true, owners: ['@org/ui'], sources: ['codeowners.owners["@fixture/client"]'] },
    { path: 'libraries/sdk', private: false, owners: ['@maintainer'] },
  ])
  expect(report.diagnostics).toEqual([])
  expect((await inspectWorkspaceOwners({ cwd, query: '@fixture/sdk' })).packages).toHaveLength(1)
  for (const spy of spies) {
    expect(spy).not.toHaveBeenCalled()
  }
})

it('previews without writing, preserves mixed newline user blocks, detects later overrides and applies idempotently', async () => {
  const cwd = await fixture()
  await mkdir(path.join(cwd, '.github'))
  const target = path.join(cwd, '.github/CODEOWNERS')
  const prefix = '# hand maintained\r\n* @default\n'
  const suffix = '\r\n# later rule\n/apps/ @override\n/libraries/sdk/private/\n'
  const original = `${prefix}# BEGIN repoctl workspace owners\n/old/ @old\n# END repoctl workspace owners${suffix}`
  await writeFile(target, original)
  const plan = await planCodeowners({ cwd, file: '.github/CODEOWNERS' })
  expect(await readFile(target, 'utf8')).toBe(original)
  expect(plan.after.startsWith(prefix)).toBe(true)
  expect(plan.after.endsWith(suffix)).toBe(true)
  expect(plan.after).toContain('/apps/client\\ one/ @org/ui')
  expect(plan.diff).toContain('-/old/ @old')
  expect(plan.diagnostics.filter(item => item.code === 'POSSIBLE_SHADOW')).toHaveLength(2)
  expect(await applyCodeownersPlan(plan)).toMatchObject({ status: 'applied' })
  expect(await applyCodeownersPlan(plan)).toMatchObject({ status: 'unchanged' })
  expect((await planCodeowners({ cwd, file: '.github/CODEOWNERS' })).diff).toBe('')
})

it('rejects malformed mappings and markers and reports missing ownership', async () => {
  const cwd = await fixture({ '@fixture/client': ['@bad owner'], 'absent': ['@valid'], 'libraries/sdk': ['@looks-valid\n'] })
  const report = await inspectWorkspaceOwners({ cwd })
  expect(report.diagnostics.map(item => item.code)).toEqual(expect.arrayContaining(['INVALID_OWNER', 'UNKNOWN_WORKSPACE', 'MISSING_OWNER']))
  expect(report.diagnostics).toContainEqual(expect.objectContaining({ code: 'INVALID_OWNER', source: 'codeowners.owners["libraries/sdk"]' }))
  const plan = await planCodeowners({ cwd, file: 'CODEOWNERS' })
  await expect(applyCodeownersPlan(plan)).rejects.toThrow('errors')
  await expect(readFile(path.join(cwd, 'CODEOWNERS'))).rejects.toThrow()
  await writeConfig(cwd, [])
  expect((await inspectWorkspaceOwners({ cwd })).diagnostics).toContainEqual(expect.objectContaining({ code: 'INVALID_CONFIG' }))
  await writeConfig(cwd, { '@fixture/client': ['@valid'] })
  await writeFile(path.join(cwd, 'CODEOWNERS'), '# END repoctl workspace owners\n')
  expect((await planCodeowners({ cwd, file: 'CODEOWNERS' })).diagnostics).toContainEqual(expect.objectContaining({ code: 'INVALID_MARKERS' }))
})

it('rejects stale config, newly discovered workspaces, tampered content and concurrent file edits', async () => {
  const cwd = await fixture()
  const initial = await planCodeowners({ cwd, file: 'CODEOWNERS' })
  await expect(applyCodeownersPlan({ ...initial, after: 'tampered' })).rejects.toThrow('changed')
  await writeConfig(cwd, { '@fixture/client': ['@changed'], 'libraries/sdk': ['@maintainer'] })
  await expect(applyCodeownersPlan(initial)).rejects.toThrow('changed')
  const current = await planCodeowners({ cwd, file: 'CODEOWNERS' })
  await mkdir(path.join(cwd, 'libraries/new'))
  await writeFile(path.join(cwd, 'libraries/new/package.json'), '{"name":"new"}')
  await expect(applyCodeownersPlan(current)).rejects.toThrow('changed')
  const discovered = await planCodeowners({ cwd, file: 'CODEOWNERS' })
  await writeFile(path.join(cwd, 'CODEOWNERS'), '# concurrent edit\n')
  await expect(applyCodeownersPlan(discovered)).rejects.toThrow('changed')
  expect(await readFile(path.join(cwd, 'CODEOWNERS'), 'utf8')).toBe('# concurrent edit\n')
})

it('confines writes to explicit recognized files and rejects hardlinks and symlink parents', async () => {
  const cwd = await fixture()
  await expect(planCodeowners({ cwd, file: '../CODEOWNERS' })).rejects.toThrow('Explicitly')
  const target = path.join(cwd, 'CODEOWNERS')
  await writeFile(path.join(cwd, 'original'), '# retained\n')
  await link(path.join(cwd, 'original'), target)
  await expect(planCodeowners({ cwd, file: 'CODEOWNERS' })).rejects.toThrow('unsafe')
  await mkdir(path.join(cwd, 'external'))
  await symlink(path.join(cwd, 'external'), path.join(cwd, '.github'), process.platform === 'win32' ? 'junction' : 'dir')
  await expect(planCodeowners({ cwd, file: '.github/CODEOWNERS' })).rejects.toThrow('unsafe')
  expect(await readFile(path.join(cwd, 'original'), 'utf8')).toBe('# retained\n')
})

it('tracks imported config files and changes to higher-priority CODEOWNERS candidates', async () => {
  const cwd = await fixture()
  await writeFile(path.join(cwd, 'owners.mjs'), 'export default { "@fixture/client": ["@first"], "libraries/sdk": ["@maintainer"] }')
  await writeFile(path.join(cwd, 'repoctl.config.mjs'), 'import owners from "./owners.mjs"; export default { codeowners: { owners } }')
  const plan = await planCodeowners({ cwd, file: 'CODEOWNERS' })
  expect(plan.inputs['owners.mjs']).toEqual(expect.any(String))
  const loaded = await loadMonorepoConfigDetails(cwd, { refresh: true })
  expect(loaded.files).toHaveLength(2)
  expect(new Set(loaded.files).size).toBe(loaded.files.length)
  expect(loaded.files.every(file => !file.includes('\\'))).toBe(true)
  expect(plan.inputs['.github/CODEOWNERS']).toBeNull()
  await writeFile(path.join(cwd, 'owners.mjs'), 'export default { "@fixture/client": ["@second"], "libraries/sdk": ["@maintainer"] }')
  await expect(applyCodeownersPlan(plan)).rejects.toThrow('changed')
  const next = await planCodeowners({ cwd, file: 'CODEOWNERS' })
  expect(next.after).toContain('@second')
  await mkdir(path.join(cwd, '.github'))
  await writeFile(path.join(cwd, '.github/CODEOWNERS'), '* @active\n')
  await expect(applyCodeownersPlan(next)).rejects.toThrow('changed')
  await expect(readFile(path.join(cwd, 'CODEOWNERS'))).rejects.toThrow()
})

it('emits parseable CI JSON and requires an explicit target before syncing', async () => {
  const cwd = await fixture()
  const cli = fileURLToPath(new URL('../../../dist/cli.mjs', import.meta.url))
  const run = (...args: string[]) => spawnSync(process.execPath, [cli, 'workspace', 'owners', ...args], { cwd, encoding: 'utf8', env: { ...process.env, CI: 'true' } })
  expect(run('--sync').status).toBe(1)
  const preview = run('--file', '.github/CODEOWNERS', '--sync', '--dry-run', '--json')
  expect(preview.status, preview.stderr).toBe(0)
  expect(JSON.parse(preview.stdout)).toMatchObject({ schemaVersion: 1, changed: true })
  await expect(readFile(path.join(cwd, '.github/CODEOWNERS'))).rejects.toThrow()
  const result = run('--file', '.github/CODEOWNERS', '--sync', '--json')
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout).result.status).toBe('applied')
  expect(run('unknown', '--json').status).toBe(1)
})

it('generates a working root default before more specific nested package owners', async () => {
  const cwd = await fixture({ '.': ['@root'], '@fixture/client': ['@org/ui'], 'libraries/sdk': ['@maintainer'], 'nested': ['@nested'] })
  await writeFile(path.join(cwd, 'pnpm-workspace.yaml'), 'packages:\n  - apps/**\n  - libraries/*\n')
  await mkdir(path.join(cwd, 'apps/client one/nested'), { recursive: true })
  await writeFile(path.join(cwd, 'apps/client one/nested/package.json'), '{"name":"nested","private":true}')
  const plan = await planCodeowners({ cwd, file: 'CODEOWNERS' })
  expect(plan.after).toContain('\n* @root\n/apps/client\\ one/ @org/ui\n/apps/client\\ one/nested/ @nested\n')
  expect(plan.diagnostics).toEqual([])
})

it('warns about wildcard and ownerless shadow rules while excluding unrelated directories', async () => {
  const cwd = await fixture()
  const rules = ['/apps/client*/ @override', '/libraries/s?k/**', '/elsewhere/*/ @other', '/apps/other*/ @other', 'docs/ @descendant', '/README.md @root-only']
  await writeFile(path.join(cwd, 'CODEOWNERS'), ['# BEGIN repoctl workspace owners', '# END repoctl workspace owners', ...rules, ''].join('\n'))
  const plan = await planCodeowners({ cwd, file: 'CODEOWNERS' })
  expect(plan.diagnostics.filter(item => item.code === 'POSSIBLE_SHADOW')).toMatchObject([
    { source: 'apps/client one', line: 3 },
    { source: 'libraries/sdk', line: 4 },
    { source: 'apps/client one', line: 7 },
    { source: 'libraries/sdk', line: 7 },
  ])
})

it('resolves a symlink cwd before discovering packages or selecting the output file', async () => {
  const cwd = await fixture()
  const holder = await realpath(await mkdtemp(path.join(tmpdir(), 'repoctl-owners-link-')))
  roots.push(holder)
  const alias = path.join(holder, 'workspace')
  await symlink(cwd, alias, process.platform === 'win32' ? 'junction' : 'dir')
  const plan = await planCodeowners({ cwd: alias, file: 'CODEOWNERS' })
  expect(plan.workspaceDir).toBe(cwd)
  expect(plan.file).toBe('CODEOWNERS')
  expect(plan.diagnostics).toEqual([])
  expect(await applyCodeownersPlan(plan)).toMatchObject({ status: 'applied' })
  expect(await readFile(path.join(cwd, 'CODEOWNERS'), 'utf8')).toBe(plan.after)
})
