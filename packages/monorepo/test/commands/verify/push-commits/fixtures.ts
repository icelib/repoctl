import { execFile, execFileSync } from 'node:child_process'
import { lstat, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { expect } from 'vitest'
import fs from '@/utils/fs'

const execute = promisify(execFile)
const builtModule = new URL('../../../../dist/index.mjs', import.meta.url).href
const crossSpawnModule = import.meta.resolve('cross-spawn')

export interface TraceEntry {
  kind: 'spawn' | 'check' | 'prepare'
  cwd: string
  command?: string
  args?: string[]
  status?: number | null
  state?: string
  head?: string
  dependency?: string
  borrowed?: boolean
}

const checkScript = `
import { appendFileSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
const state = readFileSync('state.txt', 'utf8').trim()
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
appendFileSync(process.env.REPOCTL_PUSH_TRACE, JSON.stringify({ kind: 'check', cwd: process.cwd(), state, head }) + '\\n')
process.exit(state.includes('BROKEN') ? 9 : 0)
`

export async function createPushFixture(nested = false) {
  const directory = await fs.mkdtemp(path.join(tmpdir(), 'repoctl-pushed-commits-'))
  const gitRoot = path.join(directory, 'repository')
  const cwd = nested ? path.join(gitRoot, 'nested', 'workspace') : gitRoot
  await fs.ensureDir(cwd)
  const git = (...args: string[]) => execFileSync('git', [
    '-c',
    'core.hooksPath=',
    '-c',
    'commit.gpgsign=false',
    '-c',
    'user.name=repoctl-test',
    '-c',
    'user.email=repoctl@example.invalid',
    ...args,
  ], { cwd: gitRoot, encoding: 'utf8' }).trim()
  const put = (file: string, content: string) => fs.outputFile(path.join(cwd, file), content)
  const commit = (message: string) => {
    git('add', '-A')
    git('commit', '-qm', message)
    return git('rev-parse', 'HEAD')
  }
  git('init', '-q', '-b', 'main')
  await put('.gitignore', 'node_modules/\n')
  await put('package.json', JSON.stringify({ name: 'fixture-root', private: true }))
  await put('pnpm-workspace.yaml', 'packages: [modules/*]\n')
  for (const name of ['a', 'b']) {
    await put(`modules/${name}/package.json`, JSON.stringify({ name: `fixture-${name}`, private: true, scripts: { test: 'node check.mjs' } }))
    await put(`modules/${name}/check.mjs`, checkScript)
    await put(`modules/${name}/state.txt`, `healthy base ${name}\n`)
  }
  const base = commit('base')
  await put('modules/a/state.txt', 'healthy main a\n')
  const main = commit('main')
  git('checkout', '-qb', 'broken', base)
  await put('modules/b/state.txt', 'BROKEN unpublished b\n')
  const broken = commit('broken')
  git('checkout', '-q', 'main')
  return { directory, gitRoot, cwd, git, put, commit, base, main, broken }
}

export type PushFixture = Awaited<ReturnType<typeof createPushFixture>>

export function pushLine(ref: string, local: string, remote: string) {
  return `${ref} ${local} ${ref} ${remote}\n`
}

export async function snapshotOriginal(fixture: PushFixture) {
  const files: Record<string, string> = {}
  async function visit(directory: string) {
    for (const name of (await readdir(directory)).sort()) {
      if (name === '.git') {
        continue
      }
      const file = path.join(directory, name)
      const relative = path.relative(fixture.gitRoot, file)
      const stat = await lstat(file)
      if (stat.isDirectory()) {
        files[`${relative}/`] = 'directory'
        await visit(file)
      }
      else {
        files[relative] = `${stat.mode}:${(await readFile(file)).toString('base64')}`
      }
    }
  }
  await visit(fixture.gitRoot)
  return {
    files,
    head: fixture.git('rev-parse', 'HEAD'),
    index: (await readFile(path.join(fixture.gitRoot, '.git', 'index'))).toString('base64'),
    status: fixture.git('status', '--porcelain=v1', '--untracked-files=all'),
  }
}

export async function runPush(fixture: PushFixture, stdinText: string, workspaces?: string[]) {
  const trace = path.join(fixture.directory, 'trace.jsonl')
  const input = path.join(fixture.directory, 'input.json')
  await fs.writeFile(trace, '')
  await fs.writeJson(input, { cwd: fixture.cwd, stdinText, ...(workspaces ? { workspaces } : {}) })
  const script = `
    import { appendFileSync, readFileSync } from 'node:fs'
    const [input, moduleUrl, spawnUrl] = process.argv.slice(1)
    const { default: crossSpawn } = await import(spawnUrl)
    const { verifyPrePush } = await import(moduleUrl)
    await verifyPrePush({ ...JSON.parse(readFileSync(input, 'utf8')), spawn(command, args, options) {
      const result = crossSpawn.sync(command, args, { ...options, stdio: 'pipe' })
      appendFileSync(process.env.REPOCTL_PUSH_TRACE, JSON.stringify({ kind: 'spawn', command, args, cwd: String(options.cwd), status: result.status }) + '\\n')
      if (result.stdout) process.stdout.write(result.stdout)
      if (result.stderr) process.stderr.write(result.stderr)
      return result
    } })
  `
  let status = 0
  let output = ''
  try {
    const result = await execute(process.execPath, ['--input-type=module', '-e', script, input, builtModule, crossSpawnModule], {
      cwd: fixture.directory,
      env: { ...process.env, REPOCTL_PUSH_TRACE: trace },
      timeout: 60000,
    })
    output = `${result.stdout}\n${result.stderr}`
  }
  catch (error) {
    const result = error as { code?: number, stdout?: string, stderr?: string }
    status = result.code ?? -1
    output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  }
  const entries = (await fs.readFile(trace, 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line) as TraceEntry)
  return { status, output, entries, checks: entries.filter(entry => entry.kind === 'check'), calls: entries.filter(entry => entry.kind === 'spawn') }
}

export async function expectCleanedSnapshots(fixture: PushFixture, entries: TraceEntry[]) {
  const directories = [...new Set(entries.map(entry => entry.cwd))]
  expect(directories.length).toBeGreaterThan(0)
  for (const directory of directories) {
    const relative = path.relative(fixture.gitRoot, directory)
    expect(relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))).toBe(false)
    expect(await fs.pathExists(directory)).toBe(false)
  }
}
