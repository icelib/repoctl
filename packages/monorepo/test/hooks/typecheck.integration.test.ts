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
    expect(fs.readFileSync(path.join(cwd, 'packages/a/checked.log'), 'utf8')).toBe('a\n')
  })
})
