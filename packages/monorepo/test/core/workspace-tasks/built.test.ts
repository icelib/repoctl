import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist -- Exercise the shipped API.
import { getWorkspaceTaskCatalog, locateWorkspace } from '../../../dist/index.mjs'

const roots: string[] = []
const cli = fileURLToPath(new URL('../../../bin/repoctl.js', import.meta.url))
async function fixture() {
  const cwd = await realpath(await mkdtemp(path.join(tmpdir(), 'repoctl task catalog ')))
  roots.push(cwd)
  async function manifest(directory: string, value: object) {
    await mkdir(path.join(cwd, directory), { recursive: true })
    await writeFile(path.join(cwd, directory, 'package.json'), JSON.stringify(value))
  }
  const danger = 'node -e "require(\'fs\').writeFileSync(\'SCRIPT_RAN\',\'bad\')"'
  await manifest('.', { name: 'root', private: true, scripts: { build: danger, test: danger } })
  await writeFile(path.join(cwd, 'pnpm-workspace.yaml'), 'packages: [apps/*, libraries/*]\n')
  await manifest('apps/client one ![]', { name: '@scope/client-a', private: true, description: 'Primary web client', scripts: { dev: danger, test: danger } })
  await manifest('apps/client-two', { name: '@scope/client-b', private: true, scripts: { build: danger } })
  await manifest('libraries/sdk', { name: '@scope/sdk', description: 'SDK utilities', scripts: {} })
  return { cwd, manifest, danger }
}
async function contents(cwd: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  for (const entry of await readdir(cwd, { withFileTypes: true })) {
    const file = path.join(cwd, entry.name)
    if (entry.isDirectory()) {
      for (const [name, content] of Object.entries(await contents(file))) {
        result[`${entry.name}/${name}`] = content
      }
    }
    else {
      result[entry.name] = await readFile(file, 'utf8')
    }
  }
  return result
}
function invoke(cwd: string, args: string[], options: { preload?: string, ci?: string } = {}) {
  const result = spawnSync(process.execPath, [...(options.preload ? ['--require', options.preload] : []), cli, 'workspace', ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 10_000,
    env: { ...process.env, CI: options.ci ?? 'true', NODE_ENV: 'production' },
  })
  if (result.error) {
    throw result.error
  }
  return result
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { force: true, recursive: true })))
})

describe('built workspace task discovery', () => {
  it('reports real scripts, missing tasks, private applications and root tasks without executing them', async () => {
    const f = await fixture()
    const before = await contents(f.cwd)
    const all = await getWorkspaceTaskCatalog(path.join(f.cwd, 'apps/client-two'))
    expect(all.packages.map(pkg => pkg.id)).toEqual(['.', 'apps/client one ![]', 'apps/client-two', 'libraries/sdk'])
    expect(all.packages.find(pkg => pkg.id === 'libraries/sdk')?.tasks).toEqual([])
    const tests = await getWorkspaceTaskCatalog(f.cwd, { script: 'test' })
    expect(tests.packages.map(pkg => pkg.id)).toEqual(['.', 'apps/client one ![]'])
    expect(tests.excluded).toEqual([{ id: 'apps/client-two', reason: 'missing_script' }, { id: 'libraries/sdk', reason: 'missing_script' }])
    const task = tests.packages[1]!.tasks.find(task => task.name === 'test')!
    expect(task.command).toBe(f.danger)
    expect(task.invocation).toEqual({ executable: 'pnpm', args: ['--dir', tests.packages[1]!.directory, 'run', 'test'] })
    expect(await contents(f.cwd)).toEqual(before)
  })

  it('searches descriptions and task names literally and refreshes changed manifests', async () => {
    const f = await fixture()
    expect((await getWorkspaceTaskCatalog(f.cwd, { query: 'SDK UTILITIES' })).packages.map(pkg => pkg.name)).toEqual(['@scope/sdk'])
    expect((await getWorkspaceTaskCatalog(f.cwd, { query: 'dev' })).packages.map(pkg => pkg.name)).toEqual(['@scope/client-a'])
    expect((await getWorkspaceTaskCatalog(f.cwd, { query: '![]' })).packages).toHaveLength(1)
    expect((await getWorkspaceTaskCatalog(f.cwd, { includePrivate: false })).packages.map(pkg => pkg.name)).toEqual(['@scope/sdk'])
    expect((await getWorkspaceTaskCatalog(f.cwd, { includeRoot: false })).packages.every(pkg => !pkg.root)).toBe(true)
    await f.manifest('libraries/sdk', { name: '@scope/sdk', scripts: { test: 'node --version' } })
    expect((await getWorkspaceTaskCatalog(f.cwd, { script: 'test' })).packages).toHaveLength(3)
  })

  it('prefers exact names and paths, reports ambiguous search and missing candidates', async () => {
    const f = await fixture()
    expect(await locateWorkspace(f.cwd, '@scope/client-a')).toMatchObject({ status: 'found', candidates: [{ id: 'apps/client one ![]' }] })
    expect(await locateWorkspace(f.cwd, './apps/client one ![]')).toMatchObject({ status: 'found' })
    expect(await locateWorkspace(f.cwd, './apps/client one ![]/')).toMatchObject({ status: 'found' })
    expect(await locateWorkspace(f.cwd, '.')).toMatchObject({ status: 'found', candidates: [{ root: true }] })
    expect(await locateWorkspace(f.cwd, path.parse(f.cwd).root)).toMatchObject({ status: 'not_found', candidates: [] })
    expect(await locateWorkspace(f.cwd, 'client')).toMatchObject({ status: 'ambiguous' })
    expect((await locateWorkspace(f.cwd, 'client')).candidates).toHaveLength(2)
    expect(await locateWorkspace(f.cwd, 'absent')).toMatchObject({ status: 'not_found', candidates: [] })
    await expect(locateWorkspace(f.cwd, ' ')).rejects.toThrow('nonempty')
  })

  it('prints parseable CI JSON and one exact path; ambiguous/nonexistent results fail without scripts', async () => {
    const f = await fixture()
    const before = await contents(f.cwd)
    const tasks = invoke(f.cwd, ['tasks', '--script', 'test', '--json'])
    expect(tasks.status, tasks.stderr).toBe(0)
    expect(JSON.parse(tasks.stdout).packages.map((pkg: { id: string }) => pkg.id)).toEqual(['.', 'apps/client one ![]'])
    const location = invoke(f.cwd, ['locate', '@scope/client-a'])
    expect(location.status, location.stderr).toBe(0)
    expect(path.normalize(location.stdout.trimEnd())).toBe(path.join(f.cwd, 'apps/client one ![]'))
    const ambiguous = invoke(f.cwd, ['locate', 'client', '--interactive', '--json'])
    expect(ambiguous.status).toBe(1)
    expect(JSON.parse(ambiguous.stdout).status).toBe('ambiguous')
    const text = invoke(f.cwd, ['locate', 'client', '--interactive'])
    expect(text.status).toBe(1)
    expect(text.stdout).toBe('')
    expect(text.stderr).toContain('@scope/client-b')
    expect(invoke(f.cwd, ['tasks', '--script', 'absent']).status).toBe(1)
    expect(invoke(f.cwd, ['locate', 'absent', '--json']).status).toBe(1)
    expect(await contents(f.cwd)).toEqual(before)
  })

  it('treats absolute paths as exact directory queries, including roots, dot segments and symlinks', async () => {
    const f = await fixture()
    const child = path.join(f.cwd, 'apps/client one ![]')
    const link = path.join(f.cwd, 'linked client')
    await symlink(child, link, 'junction')
    for (const query of [child, `${child}${path.sep}`, `${child}${path.sep}..${path.sep}client one ![]`, link]) {
      const location = await locateWorkspace(f.cwd, query)
      expect(location.status).toBe('found')
      expect(location.candidates.map(pkg => path.normalize(pkg.directory))).toEqual([child])
    }
    expect(await locateWorkspace(child, f.cwd)).toMatchObject({ status: 'found', candidates: [{ root: true }] })
    expect(await locateWorkspace(child, '.')).toMatchObject({ status: 'found', candidates: [{ root: true }] })
    const absoluteMissing = path.join(f.cwd, 'absent')
    await f.manifest('libraries/sdk', { name: '@scope/sdk', description: absoluteMissing })
    expect(await locateWorkspace(f.cwd, absoluteMissing)).toMatchObject({ status: 'not_found', candidates: [] })
    expect(await locateWorkspace(f.cwd, path.join(child, 'package.json'))).toMatchObject({ status: 'not_found', candidates: [] })
    const output = invoke(f.cwd, ['locate', `${child}${path.sep}`])
    expect(output.status, output.stderr).toBe(0)
    expect(path.normalize(output.stdout.trimEnd())).toBe(child)
    const root = invoke(f.cwd, ['locate', path.parse(f.cwd).root, '--json'])
    expect(root.status).toBe(1)
    expect(JSON.parse(root.stdout)).toMatchObject({ status: 'not_found', candidates: [] })
  })

  it.skipIf(process.platform === 'win32')('does not reinterpret Windows drive or UNC paths as fuzzy package queries on POSIX', async () => {
    const f = await fixture()
    for (const query of ['C:\\', 'C:\\repo\\client', 'C:/repo/client/', 'C:client', '\\\\server\\share\\client']) {
      await f.manifest('libraries/sdk', { name: '@scope/sdk', description: `Example path ${query}` })
      expect(await locateWorkspace(f.cwd, query), query).toMatchObject({ status: 'not_found', candidates: [] })
    }
  })

  it('keeps CI noninteractive even when all streams report TTY capability', async () => {
    const f = await fixture()
    const preload = path.join(f.cwd, 'tty-preload.cjs')
    await writeFile(preload, `for (const stream of [process.stdin, process.stdout, process.stderr]) Object.defineProperty(stream, 'isTTY', { value: true });`)
    const before = await contents(f.cwd)
    for (const ci of ['true', '1', 'TRUE', ' true ']) {
      const result = invoke(f.cwd, ['locate', 'client', '--interactive'], { preload, ci })
      expect(result.status, result.stderr).toBe(1)
      expect(result.stdout).toBe('')
      expect(result.stderr).toContain('ambiguous: client')
      expect(result.stderr).not.toContain('Select a workspace')
    }
    const json = invoke(f.cwd, ['locate', 'client', '--interactive', '--json'], { preload, ci: 'false' })
    expect(json.status).toBe(1)
    expect(JSON.parse(json.stdout)).toMatchObject({ status: 'ambiguous' })
    expect(await contents(f.cwd)).toEqual(before)
  })
})
