import type { SpawnSyncOptionsWithStringEncoding } from 'node:child_process'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import YAML from 'yaml'

export const repoRoot = path.resolve(import.meta.dirname, '../../../..')
export const lefthookBin = path.join(repoRoot, 'node_modules/lefthook/bin/index.js')
export const postinstallScript = path.join(repoRoot, 'node_modules/lefthook/postinstall.js')
export const cliBin = path.join(repoRoot, 'packages/monorepo/bin/repo.js')
export const defaultConfig = fs.readFileSync(path.join(repoRoot, 'packages/monorepo/assets/lefthook.yml'), 'utf8')

export function temporaryDirectory() {
  return fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'repoctl-hooks-')))
}

export function environment(cwd: string): NodeJS.ProcessEnv {
  return { ...process.env, CI: 'false', LEFTHOOK: '1', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: path.join(cwd, 'global.gitconfig') }
}

export function run(cwd: string, executable: string, args: string[], env = environment(cwd)) {
  const options: SpawnSyncOptionsWithStringEncoding = { cwd, env, encoding: 'utf8', timeout: 30_000 }
  const result = spawnSync(executable, args, options)
  if (result.error) {
    throw result.error
  }
  return { ...result, output: `${result.stdout ?? ''}${result.stderr ?? ''}` }
}

export function git(cwd: string, ...args: string[]) {
  const result = run(cwd, 'git', args)
  if (result.status !== 0) {
    throw new Error(result.output)
  }
  return result.stdout.trim()
}

export function initializeGit(cwd: string) {
  fs.writeFileSync(path.join(cwd, 'global.gitconfig'), '')
  git(cwd, 'init', '-q')
  git(cwd, 'config', 'user.name', 'Hook Test')
  git(cwd, 'config', 'user.email', 'hooks@example.com')
  git(cwd, 'config', 'commit.gpgsign', 'false')
  git(cwd, 'config', 'core.autocrlf', 'false')
}

export function write(cwd: string, filename: string, content: string) {
  fs.mkdirSync(path.dirname(path.join(cwd, filename)), { recursive: true })
  fs.writeFileSync(path.join(cwd, filename), content)
}

export function createHookRepository(cwd: string, configuration = defaultConfig) {
  initializeGit(cwd)
  const config = YAML.parse(configuration)
  config['pre-commit'].jobs[0].run = 'node fix.cjs eslint {staged_files}'
  config['pre-commit'].jobs[1].run = 'node fix.cjs stylelint {staged_files}'
  config['pre-commit'].jobs[2].run = 'node check.cjs'
  config['commit-msg'].jobs[0].run = 'node message.cjs "{1}"'
  for (const job of config['pre-push'].jobs) {
    job.run = `node record.cjs ${job.name}`
  }
  write(cwd, 'lefthook.yml', YAML.stringify(config))
  write(cwd, '.gitignore', 'order.log\nmessage.log\n')
  write(cwd, 'fix.cjs', `
const fs = require('node:fs')
const [kind, ...files] = process.argv.slice(2)
fs.appendFileSync('order.log', kind + '\\n')
for (const file of files) {
  if (!fs.existsSync(file)) throw new Error('deleted file passed to fixer')
  const value = fs.readFileSync(file, 'utf8')
  if (value.includes('UNSTAGED_SENTINEL')) throw new Error('unstaged content reached fixer')
  fs.writeFileSync(file, value.replaceAll(kind === 'eslint' ? 'BAD_JS' : 'BAD_CSS', 'FIXED'))
}
`)
  write(cwd, 'check.cjs', `
const fs = require('node:fs')
fs.appendFileSync('order.log', 'typecheck\\n')
if (fs.existsSync('fail-typecheck')) process.exit(1)
`)
  write(cwd, 'record.cjs', 'require(\'node:fs\').appendFileSync(\'order.log\', process.argv[2] + \'\\n\')\n')
  write(cwd, 'message.cjs', 'const fs = require(\'node:fs\'); fs.writeFileSync(\'message.log\', fs.readFileSync(process.argv[2], \'utf8\')); if (!fs.readFileSync(process.argv[2], \'utf8\').startsWith(\'feat:\')) process.exit(1)\n')
  git(cwd, 'add', '.')
  git(cwd, '-c', `core.hooksPath=${path.join(cwd, 'no-hooks')}`, 'commit', '-qm', 'initial')
  const installed = run(cwd, process.execPath, [lefthookBin, 'install'])
  if (installed.status !== 0) {
    throw new Error(installed.output)
  }
}

export function commit(cwd: string, message = 'feat: verify hooks') {
  return run(cwd, 'git', ['commit', '-qm', message])
}
