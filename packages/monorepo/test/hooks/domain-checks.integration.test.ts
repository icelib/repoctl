import fs from 'node:fs'
import path from 'node:path'
import { installGitHooks } from 'repoctl'
import { afterEach, describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { commit, createHookRepository, environment, git, repoRoot, temporaryDirectory, write } from './helpers'

const directories: string[] = []
afterEach(() => {
  for (const cwd of directories.splice(0)) {
    fs.rmSync(cwd, { recursive: true, force: true })
  }
})

describe('configured native domain checks', () => {
  it('retains native jobs, stages domain fixes and protects unstaged hunks before final typecheck', async () => {
    const cwd = temporaryDirectory()
    directories.push(cwd)
    createHookRepository(cwd)
    const config = YAML.parse(fs.readFileSync(path.join(cwd, 'lefthook.yml'), 'utf8'))
    config['pre-commit'].jobs.at(-1).run = 'pnpm exec repo verify staged-typecheck'
    write(cwd, 'lefthook.yml', YAML.stringify(config))
    write(cwd, 'package.json', JSON.stringify({ scripts: { typecheck: 'node check.cjs' } }))
    write(cwd, 'repoctl.config.ts', `export default { tooling: { hooks: { preCommit: [{ name: 'inventory', glob: '*.ts', run: 'node domain.cjs {staged_files}', stageFixed: true }] } } }\n`)
    write(cwd, 'domain.cjs', `
const fs = require('node:fs')
fs.appendFileSync('order.log', 'inventory\\n')
for (const file of process.argv.slice(2)) {
  const text = fs.readFileSync(file, 'utf8')
  if (text.includes('UNSTAGED_SENTINEL')) throw new Error('unstaged content reached domain check')
  fs.writeFileSync(file, text.replaceAll('DOMAIN_BAD', 'DOMAIN_FIXED'))
}
`)
    const env = environment(cwd)
    env['PATH'] = `${path.join(repoRoot, 'node_modules/.bin')}${path.delimiter}${env['PATH'] ?? ''}`
    expect(await installGitHooks(cwd, { env })).toMatchObject({ status: 'installed', configuredChecks: ['inventory'] })
    const firstConfig = fs.readFileSync(path.join(cwd, 'lefthook.yml'), 'utf8')
    expect(await installGitHooks(cwd, { env })).toMatchObject({ status: 'installed', configuredChecks: ['inventory'] })
    expect(fs.readFileSync(path.join(cwd, 'lefthook.yml'), 'utf8')).toBe(firstConfig)
    const jobs = YAML.parse(firstConfig)['pre-commit'].jobs
    expect(jobs.map((job: { name: string }) => job.name)).toEqual(['eslint', 'stylelint', 'repoctl-domain:inventory', 'typecheck'])
    expect(jobs[0].stage_fixed).toBe(true)
    expect(jobs[1].stage_fixed).toBe(true)
    expect(jobs[2].stage_fixed).toBe(true)
    const middle = Array.from({ length: 20 }, (_, index) => `// line ${index}`).join('\n')
    write(cwd, 'partial.ts', `original\n${middle}\noriginal end\n`)
    git(cwd, 'add', 'partial.ts')
    expect(commit(cwd).status).toBe(0)
    fs.writeFileSync(path.join(cwd, 'order.log'), '')
    write(cwd, 'partial.ts', `BAD_JS DOMAIN_BAD\n${middle}\noriginal end\n`)
    git(cwd, 'add', 'partial.ts')
    write(cwd, 'partial.ts', `BAD_JS DOMAIN_BAD\n${middle}\nUNSTAGED_SENTINEL\n`)
    const committed = commit(cwd)
    expect(committed.status, committed.output).toBe(0)
    expect(git(cwd, 'show', 'HEAD:partial.ts')).toBe(`FIXED DOMAIN_FIXED\n${middle}\noriginal end`)
    expect(fs.readFileSync(path.join(cwd, 'partial.ts'), 'utf8')).toBe(`FIXED DOMAIN_FIXED\n${middle}\nUNSTAGED_SENTINEL\n`)
    expect(fs.readFileSync(path.join(cwd, 'order.log'), 'utf8')).toBe('eslint\ninventory\ntypecheck\n')
    expect(git(cwd, 'stash', 'list')).toBe('')
  })
})
