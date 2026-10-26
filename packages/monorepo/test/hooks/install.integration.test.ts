import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { installGitHooks } from 'repoctl'
import { afterEach, describe, expect, it } from 'vitest'
import { cliBin, defaultConfig, environment, git, initializeGit, repoRoot, run, temporaryDirectory, write } from './helpers'

const directories: string[] = []

function repository() {
  const cwd = temporaryDirectory()
  directories.push(cwd)
  initializeGit(cwd)
  write(cwd, 'package.json', '{"private":true}')
  write(cwd, 'lefthook.yml', defaultConfig)
  return cwd
}

function isolatedEnvironment(cwd: string): NodeJS.ProcessEnv {
  const env = environment(cwd)
  return { ...env, PATH: `${path.join(repoRoot, 'node_modules/.bin')}${path.delimiter}${env['PATH'] ?? ''}` }
}

function install(cwd: string) {
  return installGitHooks(cwd, { env: isolatedEnvironment(cwd) })
}

afterEach(() => {
  for (const cwd of directories.splice(0).reverse()) {
    fs.rmSync(cwd, { recursive: true, force: true })
  }
})

describe('public Git hook installer', () => {
  it('installs repeatedly through the built public CLI and migrates default repository-local Husky', () => {
    const cwd = repository()
    write(cwd, '.husky/pre-commit', 'pnpm exec lint-staged\n')
    git(cwd, 'config', '--local', 'core.hooksPath', '.husky/_')
    const call = () => run(cwd, process.execPath, [cliBin, 'tooling', 'hooks', 'install', '--json'], isolatedEnvironment(cwd))
    const first = call()
    expect(first.status, first.output).toBe(0)
    expect(JSON.parse(first.stdout)).toMatchObject({ status: 'installed', migrated: true, configuredChecks: [] })
    expect(run(cwd, 'git', ['config', '--local', '--get', 'core.hooksPath']).status).toBe(1)
    expect(fs.readFileSync(path.join(cwd, '.git/hooks/pre-commit'), 'utf8')).toContain('lefthook')
    const second = call()
    expect(second.status, second.output).toBe(0)
    expect(JSON.parse(second.stdout)).toMatchObject({ status: 'installed', migrated: false })
    expect(fs.readFileSync(path.join(cwd, 'lefthook.yml'), 'utf8')).toBe(defaultConfig)
  })

  it('runs the public installer from prepare when native package postinstall is disabled', () => {
    const cwd = repository()
    write(cwd, 'package.json', JSON.stringify({ private: true, scripts: { prepare: 'repo tooling hooks install --json' } }))
    write(cwd, 'pnpm-workspace.yaml', 'allowBuilds:\n  lefthook: false\n')
    git(cwd, 'config', '--local', 'core.hooksPath', '.husky/_')
    const prepared = run(cwd, 'pnpm', ['run', 'prepare'], isolatedEnvironment(cwd))
    expect(prepared.status, prepared.output).toBe(0)
    expect(prepared.output).toContain('"status": "installed"')
    expect(fs.readFileSync(path.join(cwd, '.git/hooks/pre-commit'), 'utf8')).toContain('lefthook')
    expect(fs.readFileSync(path.join(cwd, 'pnpm-workspace.yaml'), 'utf8')).toBe('allowBuilds:\n  lefthook: false\n')
  })

  it('skips CI, disabled hooks and non-Git directories before evaluating executable config', async () => {
    const cwd = repository()
    write(cwd, 'repoctl.config.ts', 'throw new Error("must not evaluate")\nexport default {}\n')
    git(cwd, 'config', '--local', 'core.hooksPath', '.husky/_')
    const env = isolatedEnvironment(cwd)
    const ci = run(cwd, process.execPath, [cliBin, 'tooling', 'hooks', 'install', '--json'], { ...env, CI: 'true' })
    expect(ci.status, ci.output).toBe(0)
    expect(JSON.parse(ci.stdout)).toMatchObject({ status: 'skipped', reason: 'ci', migrated: false })
    expect(await installGitHooks(cwd, { env: { ...env, LEFTHOOK: '0' } })).toMatchObject({ reason: 'disabled' })
    expect(git(cwd, 'config', '--local', '--get', 'core.hooksPath')).toBe('.husky/_')
    expect(fs.existsSync(path.join(cwd, '.git/hooks/pre-commit'))).toBe(false)
    fs.rmSync(path.join(cwd, '.git'), { recursive: true })
    expect(await install(cwd)).toMatchObject({ reason: 'not-git' })
  })

  it('preserves custom Husky scripts and unrelated local hook paths', async () => {
    const cwd = repository()
    write(cwd, '.husky/pre-commit', 'pnpm company-check\n')
    git(cwd, 'config', '--local', 'core.hooksPath', '.husky')
    expect(await install(cwd)).toMatchObject({ reason: 'custom-husky', migrated: false })
    expect(git(cwd, 'config', '--local', '--get', 'core.hooksPath')).toBe('.husky')
    git(cwd, 'config', '--local', 'core.hooksPath', 'company-hooks')
    expect(await install(cwd)).toMatchObject({ reason: 'custom-hooks-path', hooksPath: 'company-hooks', migrated: false })
    expect(fs.existsSync(path.join(cwd, 'company-hooks'))).toBe(false)
  })

  it('validates native and executable configuration before migrating Git settings', async () => {
    const cwd = repository()
    git(cwd, 'config', '--local', 'core.hooksPath', '.husky/_')
    write(cwd, 'lefthook.yml', 'pre-commit: [\n')
    await expect(install(cwd)).rejects.toThrow('Could not parse lefthook.yml')
    expect(git(cwd, 'config', '--local', '--get', 'core.hooksPath')).toBe('.husky/_')
    const invalid = repository()
    git(invalid, 'config', '--local', 'core.hooksPath', '.husky/_')
    write(invalid, 'repoctl.config.ts', 'throw new Error("invalid config")\nexport default {}\n')
    await expect(install(invalid)).rejects.toThrow()
    expect(git(invalid, 'config', '--local', '--get', 'core.hooksPath')).toBe('.husky/_')
  })

  it('re-reads inherited global hooksPath after removing a local Husky path', async () => {
    const cwd = repository()
    const inherited = path.join(cwd, 'global-hooks')
    write(cwd, 'global-hooks/pre-commit', 'preserve company policy\n')
    const globalConfig = `[core]\n\thooksPath = ${JSON.stringify(inherited)}\n`
    write(cwd, 'global.gitconfig', globalConfig)
    git(cwd, 'config', '--local', 'core.hooksPath', '.husky/_')
    expect(await install(cwd)).toMatchObject({ status: 'skipped', reason: 'custom-hooks-path', migrated: true, hooksPath: inherited })
    expect(run(cwd, 'git', ['config', '--local', '--get', 'core.hooksPath']).status).toBe(1)
    expect(fs.readFileSync(path.join(inherited, 'pre-commit'), 'utf8')).toBe('preserve company policy\n')
    expect(fs.readFileSync(path.join(cwd, 'global.gitconfig'), 'utf8')).toBe(globalConfig)
    expect(fs.existsSync(path.join(cwd, '.git/hooks/pre-commit'))).toBe(false)
  })

  it('preserves hooksPath sourced from system configuration or a local include', async () => {
    const cwd = repository()
    write(cwd, 'system.gitconfig', '[core]\n\thooksPath = system-hooks\n')
    const env = { ...isolatedEnvironment(cwd), GIT_CONFIG_NOSYSTEM: '0', GIT_CONFIG_SYSTEM: path.join(cwd, 'system.gitconfig') }
    expect(await installGitHooks(cwd, { env })).toMatchObject({ reason: 'custom-hooks-path', hooksPath: 'system-hooks' })
    write(cwd, 'included.gitconfig', '[core]\n\thooksPath = .husky/_\n')
    git(cwd, 'config', '--local', 'include.path', path.join(cwd, 'included.gitconfig'))
    expect(await install(cwd)).toMatchObject({ reason: 'custom-hooks-path', migrated: false })
    expect(fs.readFileSync(path.join(cwd, 'included.gitconfig'), 'utf8')).toContain('.husky/_')
  })

  it('installs from a nested directory in a linked worktree without changing custom worktree settings', async () => {
    const cwd = repository()
    git(cwd, 'add', 'package.json', 'lefthook.yml')
    git(cwd, '-c', 'core.hooksPath=no-hooks', 'commit', '-qm', 'initial')
    const worktree = temporaryDirectory()
    directories.push(worktree)
    git(cwd, 'worktree', 'add', '--detach', worktree)
    fs.mkdirSync(path.join(worktree, 'packages/foo/src'), { recursive: true })
    expect(await install(path.join(worktree, 'packages/foo/src/..'))).toMatchObject({ status: 'installed', migrated: false })
    git(cwd, 'config', 'extensions.worktreeConfig', 'true')
    git(worktree, 'config', '--worktree', 'core.hooksPath', 'worktree-hooks')
    expect(await install(worktree)).toMatchObject({ reason: 'custom-hooks-path', hooksPath: 'worktree-hooks' })
    expect(git(worktree, 'config', '--worktree', '--get', 'core.hooksPath')).toBe('worktree-hooks')
    expect(run(cwd, 'git', ['config', '--local', '--get', 'core.hooksPath']).status).toBe(1)
  })
})
