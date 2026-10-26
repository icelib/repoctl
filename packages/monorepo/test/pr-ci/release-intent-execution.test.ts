import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it } from 'vitest'
import YAML from 'yaml'

interface Workflow { jobs: Record<string, { steps: Array<{ name?: string, run?: string }> }> }
const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture(files: string[], options: { deletedIntent?: boolean, invalidBase?: boolean } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'release-intent-shell-'))
  roots.push(root)
  const cwd = path.join(root, 'repo')
  await mkdir(cwd)
  const git = (...args: string[]) => {
    const result = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', `core.hooksPath=${path.join(root, 'no-hooks')}`, ...args], {
      cwd,
      env: { ...process.env, GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' },
      encoding: 'utf8',
    })
    expect(result.status, result.stderr).toBe(0)
    return result.stdout.trim()
  }
  const write = async (filename: string) => {
    await mkdir(path.dirname(path.join(cwd, filename)), { recursive: true })
    await writeFile(path.join(cwd, filename), 'fixture\n')
  }
  git('init', '-q')
  await write('README.md')
  if (options.deletedIntent) {
    await write('.changeset/previous.md')
  }
  git('add', '.')
  git('commit', '-qm', 'base')
  const base = git('rev-parse', 'HEAD')
  for (const filename of files) {
    await write(filename)
  }
  if (options.deletedIntent) {
    await rm(path.join(cwd, '.changeset/previous.md'))
  }
  git('add', '.')
  git('commit', '--allow-empty', '-qm', 'candidate')
  const head = git('rev-parse', 'HEAD')
  const env = { ...process.env, BASE_SHA: options.invalidBase ? 'invalid-commit' : base, HEAD_SHA: head }
  // Model the unavailable optional tool without depending on the host's installed binaries.
  const unavailableRg = 'rg() { printf "%s\\n" "rg: command not found" >&2; return 127; }\n'
  const unavailable = spawnSync('bash', ['--noprofile', '--norc', '-c', `${unavailableRg}rg --version`], { env, encoding: 'utf8' })
  expect(unavailable.status, unavailable.error?.message ?? unavailable.stderr).toBe(127)
  return (script: string) => spawnSync('bash', ['--noprofile', '--norc', '-c', unavailableRg + script], { cwd, env, encoding: 'utf8' })
}

// Both workflow jobs run on Ubuntu; newline filenames are not valid Windows fixture paths.
describe.skipIf(process.platform === 'win32').each([
  ['source', '../../../../.github/workflows/release-intent-check.yml'],
  ['consumer', '../../assets/.github/workflows/release-intent-check.yml'],
])('%s release-intent shell admission', (_, filename) => {
  async function run(files: string[], options: Parameters<typeof fixture>[1] = {}) {
    const workflow = YAML.parse(await readFile(new URL(filename!, import.meta.url), 'utf8')) as Workflow
    const script = workflow.jobs['release-intent']!.steps.find(step => step.name === 'Validate release intent presence')!.run!
    return (await fixture(files, options))(script)
  }

  it('rejects publishable changes when rg is absent', async () => {
    const result = await run(['packages/commitlint/package.json', 'packages/eslint/package.json'])
    expect(result.status, result.stderr).toBe(1)
    expect(result.stdout).toContain('Publishable package changes require a pnpm release intent')
  })

  it('accepts added intent metadata without rg', async () => {
    const result = await run(['packages/library/src/index.ts', '.changeset/fix.md'])
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('pnpm release intent detected')
  })

  it('keeps documentation and generated dist exclusions', async () => {
    const result = await run(['docs/guide.md', 'packages/library/dist/index.js'])
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('No publishable package changes detected')
  })

  it('fails closed when the frozen diff cannot be read', async () => {
    const result = await run([], { invalidBase: true })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Unable to inspect the frozen PR changes')
    expect(result.stdout).not.toContain('No publishable package changes')
  })

  it('does not treat a newline in a package path as an added intent', async () => {
    const filename = 'packages/a package/src/line\n.changeset/fake.md'
    const result = await run([filename])
    expect(result.status, result.stderr).toBe(1)
    expect(result.stdout).toContain(filename)
  })

  it('does not accept only a deleted intent', async () => {
    const result = await run(['packages/library/src/index.ts'], { deletedIntent: true })
    expect(result.status, result.stderr).toBe(1)
    expect(result.stdout).toContain('Publishable package changes require a pnpm release intent')
  })
})
