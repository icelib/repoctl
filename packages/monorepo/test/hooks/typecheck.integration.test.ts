import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it } from 'vitest'
import { cliBin, git, initializeGit, run, temporaryDirectory, write } from './helpers'

const directories: string[] = []
afterEach(() => {
  for (const cwd of directories.splice(0)) {
    fs.rmSync(cwd, { recursive: true, force: true })
  }
})

describe('built staged-typecheck CLI', () => {
  it('reads NUL-delimited names, deduplicates workspaces and handles empty/deleted files', () => {
    const cwd = temporaryDirectory()
    directories.push(cwd)
    initializeGit(cwd)
    write(cwd, 'package.json', JSON.stringify({ scripts: { typecheck: 'node record.cjs root' } }))
    write(cwd, 'record.cjs', 'require(\'node:fs\').appendFileSync(\'checked.log\', process.argv[2] + \'\\n\')\n')
    write(cwd, 'packages/a/package.json', JSON.stringify({ scripts: { typecheck: 'node ../../record.cjs a' } }))
    write(cwd, 'packages/b/package.json', JSON.stringify({ scripts: { typecheck: 'node ../../record.cjs b' } }))
    write(cwd, 'packages/a/deleted.ts', 'value\n')
    git(cwd, 'add', '.')
    git(cwd, '-c', `core.hooksPath=${path.join(cwd, 'no-hooks')}`, 'commit', '-qm', 'initial')
    const verify = () => run(cwd, process.execPath, [cliBin, 'verify', 'staged-typecheck'])
    expect(verify().status).toBe(0)
    expect(fs.existsSync(path.join(cwd, 'checked.log'))).toBe(false)
    git(cwd, 'rm', 'packages/a/deleted.ts')
    expect(verify().status).toBe(0)
    expect(fs.existsSync(path.join(cwd, 'packages/a/checked.log'))).toBe(false)
    write(cwd, 'root.ts', 'value\n')
    git(cwd, 'add', 'root.ts')
    expect(verify().status).toBe(0)
    expect(fs.readFileSync(path.join(cwd, 'checked.log'), 'utf8')).toBe('root\n')
    expect(fs.existsSync(path.join(cwd, 'packages/a/checked.log'))).toBe(false)
    git(cwd, 'reset', '--', 'root.ts')
    fs.unlinkSync(path.join(cwd, 'checked.log'))
    for (let index = 0; index < 100; index++) {
      write(cwd, `packages/a/中文 '${index}${process.platform === 'win32' ? ' ' : '\n'}file.ts`, 'value\n')
    }
    write(cwd, 'packages/b/component.vue', '<template />\n')
    git(cwd, 'add', 'packages')
    const result = verify()
    expect(result.status, result.output).toBe(0)
    expect(fs.readFileSync(path.join(cwd, 'packages/a/checked.log'), 'utf8')).toBe('a\n')
    expect(fs.readFileSync(path.join(cwd, 'packages/b/checked.log'), 'utf8')).toBe('b\n')
    write(cwd, 'root.ts', 'value\n')
    git(cwd, 'add', 'root.ts')
    const root = verify()
    expect(root.status, root.output).toBe(0)
    expect(fs.readFileSync(path.join(cwd, 'checked.log'), 'utf8')).toBe('root\n')
    expect(fs.readFileSync(path.join(cwd, 'packages/a/checked.log'), 'utf8')).toBe('a\na\n')
    expect(fs.readFileSync(path.join(cwd, 'packages/b/checked.log'), 'utf8')).toBe('b\nb\n')
  })

  it('preserves package type errors when root tooling is staged and invoked from a nested directory', () => {
    const cwd = temporaryDirectory()
    directories.push(cwd)
    initializeGit(cwd)
    write(cwd, 'package.json', JSON.stringify({ scripts: { typecheck: 'node check.cjs' } }))
    write(cwd, 'check.cjs', 'require(\'node:fs\').appendFileSync(\'checked.log\', \'root\\n\')\n')
    write(cwd, 'packages/foo/package.json', JSON.stringify({ scripts: { typecheck: 'tsc --noEmit --pretty false' } }))
    write(cwd, 'packages/foo/tsconfig.json', '{"compilerOptions":{"types":[],"skipLibCheck":true},"include":["src"]}')
    write(cwd, 'packages/foo/src/index.ts', 'const value: number = "wrong"\n')
    write(cwd, 'repoctl.config.ts', 'export default {}\n')
    git(cwd, 'add', '.')
    const checked = run(path.join(cwd, 'packages/foo/src/..'), process.execPath, [cliBin, 'verify', 'staged-typecheck'])
    expect(checked.status, checked.output).not.toBe(0)
    expect(checked.output).toContain('TS2322')
    expect(fs.readFileSync(path.join(cwd, 'checked.log'), 'utf8')).toBe('root\n')
  })
})
