import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it } from 'vitest'
import { commit, createHookRepository, environment, git, initializeGit, lefthookBin, postinstallScript, repoRoot, run, temporaryDirectory, write } from './helpers'

const directories: string[] = []
function repository(configuration?: string) {
  const cwd = temporaryDirectory()
  directories.push(cwd)
  createHookRepository(cwd, configuration)
  return cwd
}

afterEach(() => {
  for (const cwd of directories.splice(0)) {
    fs.rmSync(cwd, { recursive: true, force: true })
  }
})

describe('native Lefthook Git hooks', () => {
  it('fixes root and nested Vue files in order and forwards commit-msg arguments', () => {
    const cwd = repository()
    const filename = 'src/中文 component\'s.vue'
    write(cwd, filename, 'BAD_JS\nBAD_CSS\n')
    write(cwd, 'root.ts', 'BAD_JS\n')
    git(cwd, 'add', filename, 'root.ts')
    const result = commit(cwd)
    expect(result.output, result.output).not.toContain('unstaged content reached fixer')
    expect(result.status, result.output).toBe(0)
    expect(git(cwd, 'show', `HEAD:${filename}`)).toBe('FIXED\nFIXED')
    expect(git(cwd, 'show', 'HEAD:root.ts')).toBe('FIXED')
    expect(fs.readFileSync(path.join(cwd, 'order.log'), 'utf8')).toBe('eslint\nstylelint\ntypecheck\n')
    expect(fs.readFileSync(path.join(cwd, 'message.log'), 'utf8')).toBe('feat: verify hooks\n')
  })

  it('stages fixes while preserving unstaged hunks', () => {
    const cwd = repository()
    const filename = 'partial.ts'
    const middle = Array.from({ length: 20 }, (_, index) => `// line ${index}`).join('\n')
    write(cwd, filename, `original\n${middle}\noriginal end\n`)
    git(cwd, 'add', filename)
    expect(commit(cwd).status).toBe(0)
    write(cwd, filename, `BAD_JS\n${middle}\noriginal end\n`)
    git(cwd, 'add', filename)
    write(cwd, filename, `BAD_JS\n${middle}\nUNSTAGED_SENTINEL\n`)
    const result = commit(cwd)
    expect(result.status, result.output).toBe(0)
    expect(git(cwd, 'show', `HEAD:${filename}`)).toBe(`FIXED\n${middle}\noriginal end`)
    expect(fs.readFileSync(path.join(cwd, filename), 'utf8')).toBe(`FIXED\n${middle}\nUNSTAGED_SENTINEL\n`)
    expect(git(cwd, 'diff', '--cached')).toBe('')
    expect(git(cwd, 'stash', 'list')).toBe('')
  })

  it('blocks a failed check and retains completed fixes', () => {
    const cwd = repository()
    const before = git(cwd, 'rev-parse', 'HEAD')
    write(cwd, 'failure.ts', 'BAD_JS\n')
    write(cwd, 'fail-typecheck', '')
    git(cwd, 'add', 'failure.ts')
    const result = commit(cwd)
    expect(result.status).not.toBe(0)
    expect(git(cwd, 'rev-parse', 'HEAD')).toBe(before)
    expect(fs.readFileSync(path.join(cwd, 'failure.ts'), 'utf8')).toBe('FIXED\n')
    expect(git(cwd, 'show', ':failure.ts')).toBe('FIXED')
    expect(fs.existsSync(path.join(cwd, 'message.log'))).toBe(false)
  })

  it('restores unstaged hunks when a later check fails', () => {
    const cwd = repository()
    const middle = Array.from({ length: 20 }, (_, index) => `// line ${index}`).join('\n')
    write(cwd, 'partial.ts', `original\n${middle}\noriginal end\n`)
    git(cwd, 'add', 'partial.ts')
    expect(commit(cwd).status).toBe(0)
    write(cwd, 'partial.ts', `BAD_JS\n${middle}\noriginal end\n`)
    git(cwd, 'add', 'partial.ts')
    write(cwd, 'partial.ts', `BAD_JS\n${middle}\nUNSTAGED_SENTINEL\n`)
    write(cwd, 'fail-typecheck', '')
    expect(commit(cwd).status).not.toBe(0)
    expect(git(cwd, 'show', ':partial.ts')).toBe(`FIXED\n${middle}\noriginal end`)
    expect(fs.readFileSync(path.join(cwd, 'partial.ts'), 'utf8')).toBe(`FIXED\n${middle}\nUNSTAGED_SENTINEL\n`)
    expect(git(cwd, 'stash', 'list')).toBe('')
  })

  it('keeps source-only Stylelint exclusions without excluding ESLint for Vue files', () => {
    const cwd = repository(fs.readFileSync(path.join(repoRoot, 'lefthook.yml'), 'utf8'))
    const filename = 'apps/mock/src/stylelint-demo/example.vue'
    write(cwd, filename, 'BAD_JS\nBAD_CSS\n')
    write(cwd, 'packages/eslint/fixtures/output/example.css', 'BAD_CSS\n')
    git(cwd, 'add', 'apps', 'packages')
    const result = commit(cwd)
    expect(result.status, result.output).toBe(0)
    expect(git(cwd, 'show', `HEAD:${filename}`)).toBe('FIXED\nBAD_CSS')
    expect(fs.readFileSync(path.join(cwd, 'order.log'), 'utf8')).toBe('eslint\ntypecheck\n')
  })

  it('blocks a restore conflict and preserves original staged and unstaged content', () => {
    const cwd = repository()
    write(cwd, 'conflict.ts', 'original\n')
    write(cwd, 'unrelated.txt', 'original\n')
    git(cwd, 'add', 'conflict.ts', 'unrelated.txt')
    expect(commit(cwd).status).toBe(0)
    write(cwd, 'conflict.ts', 'BAD_JS staged\n')
    git(cwd, 'add', 'conflict.ts')
    write(cwd, 'conflict.ts', 'BAD_JS unstaged\n')
    write(cwd, 'unrelated.txt', 'keep unrelated unstaged\n')
    const before = git(cwd, 'rev-parse', 'HEAD')
    const result = commit(cwd)
    expect(result.status, result.output).not.toBe(0)
    expect(git(cwd, 'rev-parse', 'HEAD')).toBe(before)
    expect(git(cwd, 'show', ':conflict.ts')).toBe('BAD_JS staged')
    expect(fs.readFileSync(path.join(cwd, 'conflict.ts'), 'utf8')).toBe('BAD_JS unstaged\n')
    expect(fs.readFileSync(path.join(cwd, 'unrelated.txt'), 'utf8')).toBe('keep unrelated unstaged\n')
  })

  it('handles deleted and renamed files without passing deletions to fixers', () => {
    const cwd = repository()
    write(cwd, 'old.ts', 'original\n')
    write(cwd, 'deleted.ts', 'original\n')
    git(cwd, 'add', 'old.ts', 'deleted.ts')
    expect(commit(cwd).status).toBe(0)
    git(cwd, 'mv', 'old.ts', 'renamed 中文.ts')
    git(cwd, 'rm', 'deleted.ts')
    write(cwd, 'renamed 中文.ts', 'BAD_JS\n')
    git(cwd, 'add', 'renamed 中文.ts')
    const result = commit(cwd)
    expect(result.status, result.output).toBe(0)
    expect(git(cwd, 'show', 'HEAD:renamed 中文.ts')).toBe('FIXED')
    expect(git(cwd, 'ls-files')).not.toContain('deleted.ts')
  })

  it('runs pre-push jobs in order and rejects an invalid commit message', () => {
    const cwd = repository()
    write(cwd, 'root.ts', 'value\n')
    git(cwd, 'add', 'root.ts')
    const rejected = commit(cwd, 'invalid message')
    expect(rejected.status).not.toBe(0)
    fs.writeFileSync(path.join(cwd, 'order.log'), '')
    const pushed = run(cwd, process.execPath, [lefthookBin, 'run', 'pre-push'])
    expect(pushed.status, pushed.output).toBe(0)
    expect(fs.readFileSync(path.join(cwd, 'order.log'), 'utf8')).toBe('lint\ntypecheck\n')
  })

  it('installs repeatedly and skips package postinstall in CI and outside Git', () => {
    const cwd = repository()
    expect(run(cwd, process.execPath, [lefthookBin, 'install']).status).toBe(0)
    expect(run(cwd, process.execPath, [lefthookBin, 'install']).status).toBe(0)
    const clean = temporaryDirectory()
    directories.push(clean)
    initializeGit(clean)
    write(clean, 'lefthook.yml', 'pre-commit:\n  jobs:\n    - run: echo check\n')
    const ci = run(clean, process.execPath, [postinstallScript], { ...environment(clean), CI: 'true', LEFTHOOK: '0', INIT_CWD: clean })
    expect(ci.status).toBe(0)
    expect(fs.existsSync(path.join(clean, '.git/hooks/pre-commit'))).toBe(false)
    fs.rmSync(path.join(clean, '.git'), { recursive: true, force: true })
    const noGit = run(clean, process.execPath, [postinstallScript], { ...environment(clean), INIT_CWD: clean })
    expect(noGit.status).toBe(0)
    expect(fs.existsSync(path.join(clean, '.git'))).toBe(false)
  })
})
