import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import YAML from 'yaml'

interface Workflow { jobs: Record<string, { steps: Array<{ name?: string, run?: string }> }> }
const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture(files: string[], options: {
  deletedIntent?: boolean
  headWorkspace?: string
  intentBump?: string
  intentPackages?: string[]
  invalidBase?: boolean
  packages?: Record<string, { name?: string, dependencies?: Record<string, string> }>
  workspace?: string
} = {}) {
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
  const gitInput = (input: string, ...args: string[]) => {
    const result = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', `core.hooksPath=${path.join(root, 'no-hooks')}`, ...args], {
      cwd,
      env: { ...process.env, GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' },
      encoding: 'utf8',
      input,
    })
    expect(result.status, result.stderr).toBe(0)
    return result.stdout.trim()
  }
  const packageDirectories = [...new Set([...files.flatMap((file) => {
    const match = /^packages\/([^/]+)\//u.exec(file)
    return match?.[1] ? [match[1]] : []
  }), ...Object.keys(options.packages ?? {})])]
  const packageName = (directory: string) => `@fixture/${directory}`
  let candidate = false
  const write = async (filename: string) => {
    await mkdir(path.dirname(path.join(cwd, filename)), { recursive: true })
    if (filename === 'pnpm-workspace.yaml') {
      const workspace = candidate ? options.headWorkspace ?? options.workspace : options.workspace
      await writeFile(path.join(cwd, filename), workspace ?? 'packages:\n  - packages/*\n')
    }
    else if (filename === '.github/release-intents/check.mjs') {
      await writeFile(path.join(cwd, filename), await readFile(new URL('../../../../.github/release-intents/check.mjs', import.meta.url), 'utf8'))
    }
    else if (filename.startsWith('.changeset/')) {
      const names = options.intentPackages ?? packageDirectories.map(packageName)
      await writeFile(path.join(cwd, filename), `---\n${names.map(name => `"${name}": ${options.intentBump ?? 'patch'}`).join('\n')}\n---\n\nFixture intent\n`)
    }
    else if (/^packages\/[^/]+\/package\.json$/u.test(filename)) {
      const directory = filename.split('/')[1]!
      const packageOptions = options.packages?.[directory]
      await writeFile(path.join(cwd, filename), `${JSON.stringify({
        name: packageOptions?.name ?? packageName(directory),
        version: candidate ? '1.0.1' : '1.0.0',
        ...(packageOptions?.dependencies && { dependencies: packageOptions.dependencies }),
      })}\n`)
    }
    else {
      await writeFile(path.join(cwd, filename), 'fixture\n')
    }
  }
  git('init', '-q')
  await write('README.md')
  await write('pnpm-workspace.yaml')
  await Promise.all(packageDirectories.map(directory => write(`packages/${directory}/package.json`)))
  await write('.github/release-intents/check.mjs')
  if (options.deletedIntent) {
    await write('.changeset/previous.md')
  }
  git('add', '.')
  git('commit', '-qm', 'base')
  const base = git('rev-parse', 'HEAD')
  candidate = true
  const virtualFiles: Array<{ blob: string, filename: string }> = []
  for (const filename of files) {
    if (filename.includes('\n')) {
      const blob = gitInput('fixture\n', 'hash-object', '-w', '--stdin')
      virtualFiles.push({ blob, filename })
    }
    else {
      await write(filename)
    }
  }
  if (options.deletedIntent) {
    await rm(path.join(cwd, '.changeset/previous.md'))
  }
  git('add', '.')
  for (const { blob, filename } of virtualFiles) {
    gitInput(`100644 ${blob}\t${filename}\0`, 'update-index', '-z', '--index-info')
  }
  git('commit', '--allow-empty', '-qm', 'candidate')
  const head = git('rev-parse', 'HEAD')
  const env = { ...process.env, BASE_SHA: options.invalidBase ? 'invalid-commit' : base, HEAD_SHA: head }
  return (script: string) => {
    expect(script).toContain('node .github/release-intents/check.mjs')
    const validator = fileURLToPath(new URL('../../../../.github/release-intents/check.mjs', import.meta.url))
    return spawnSync(process.execPath, [validator, env.BASE_SHA, env.HEAD_SHA], { cwd, env, encoding: 'utf8' })
  }
}

describe.each([
  ['source', '../../../../.github/workflows/release-intent-check.yml'],
  ['consumer', '../../assets/.github/workflows/release-intent-check.yml'],
])('%s release-intent admission', (_, filename) => {
  async function run(files: string[], options: Parameters<typeof fixture>[1] = {}) {
    const workflow = YAML.parse(await readFile(new URL(filename!, import.meta.url), 'utf8')) as Workflow
    const script = workflow.jobs['release-intent']!.steps.find(step => step.name === 'Validate release intent coverage')!.run!
    return (await fixture(files, options))(script)
  }

  it('rejects incomplete release intent coverage', async () => {
    const result = await run(['packages/commitlint/package.json', 'packages/eslint/package.json'])
    expect(result.status, result.stderr).toBe(1)
    expect(result.stderr).toContain('Missing .changeset entries')
  })

  it('rejects a changeset that covers only some changed packages', async () => {
    const result = await run(['packages/commitlint/src/index.ts', 'packages/eslint/src/index.ts', '.changeset/partial.md'], {
      intentPackages: ['@fixture/commitlint'],
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('@fixture/eslint')
    expect(result.stderr).not.toContain('@fixture/commitlint')
  })

  it('accepts added intent metadata', async () => {
    const result = await run(['packages/library/src/index.ts', '.changeset/fix.md'])
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('Release intent covers affected packages')
  })

  it('keeps documentation and generated dist exclusions', async () => {
    const result = await run([
      'docs/guide.md',
      'packages/library/README.md',
      'packages/library/CHANGELOG.md',
      'packages/library/docs/guide.md',
      'packages/library/test/unit.test.ts',
      'packages/library/dist/index.js',
    ])
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('No publishable package inputs detected')
  })

  it('fails closed when the frozen diff cannot be read', async () => {
    const result = await run([], { invalidBase: true })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Unable to inspect frozen release inputs')
    expect(result.stdout).not.toContain('No publishable package inputs')
  })

  it('does not treat a newline in a package path as an added intent', async () => {
    const filename = 'packages/library/src/line\n.txt'
    const result = await run([filename])
    expect(result.status, result.stderr).toBe(1)
    expect(result.stderr).toContain('Missing .changeset entries')
  })

  it('does not accept only a deleted intent', async () => {
    const result = await run(['packages/library/src/index.ts'], { deletedIntent: true })
    expect(result.status, result.stderr).toBe(1)
    expect(result.stderr).toContain('Missing .changeset entries')
  })

  it('accepts explicit none intent for every affected package', async () => {
    const result = await run(['packages/commitlint/src/index.ts', 'packages/eslint/src/index.ts', '.changeset/fix.md'], {
      intentBump: 'none',
      intentPackages: ['@fixture/commitlint', '@fixture/eslint'],
    })
    expect(result.status, result.stderr).toBe(0)
  })

  it('requires release intent only for packages that consume a changed catalog entry', async () => {
    const result = await run(['pnpm-workspace.yaml', '.changeset/fix.md'], {
      workspace: 'packages:\n  - packages/*\ncatalog:\n  stylelint: ^18.0.0\n  tailwindcss: ^4.0.0\n',
      headWorkspace: 'packages:\n  - packages/*\ncatalog:\n  stylelint: ^18.1.0\n  tailwindcss: ^4.0.0\n',
      packages: {
        stylelint: { dependencies: { stylelint: 'catalog:' } },
        tailwind: { dependencies: { tailwindcss: 'catalog:' } },
        direct: { dependencies: { stylelint: '^18.0.0' } },
      },
      intentPackages: ['@fixture/tailwind'],
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('@fixture/stylelint')
    expect(result.stderr).not.toContain('@fixture/tailwind')
    expect(result.stderr).not.toContain('@fixture/direct')
  })

  it('maps consumer workflow assets to the templates package', async () => {
    const result = await run(['packages/monorepo/assets/.github/workflows/ci.yml', '.changeset/fix.md'], {
      intentPackages: ['@icebreakers/monorepo-templates'],
    })
    expect(result.status, result.stderr).toBe(0)
  })
})
