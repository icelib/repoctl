import { execFile, spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { promisify } from 'node:util'
import path from 'pathe'
import { fixture as dependencyFixture, snapshot, writeJson } from '../deps/fixture'

const exec = promisify(execFile)
const cli = path.resolve(import.meta.dirname, '../../../bin/repoctl.js')

export { snapshot, writeJson }

export async function git(cwd: string, args: string[]) {
  return (await exec('git', ['-C', cwd, '-c', 'core.hooksPath=', '-c', 'commit.gpgsign=false', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args], { encoding: 'utf8', timeout: 30_000 })).stdout
}

export async function commit(cwd: string) {
  await git(cwd, ['add', '--all'])
  await git(cwd, ['commit', '--allow-empty', '-m', 'fixture'])
}

export async function fixture(manifests: Record<string, object> = { 'packages/old': {} }, options: { git?: boolean, nested?: boolean } = {}) {
  const h = await dependencyFixture(manifests)
  await writeFile(path.join(h.workspace, '.gitignore'), 'node_modules/\nignored/\n')
  await mkdir(path.join(h.workspace, 'docs'))
  await writeFile(path.join(h.workspace, 'docs/guide.md'), '# Preserve user documentation\n')
  await mkdir(path.join(h.home, '.agents/skills/custom'), { recursive: true })
  await writeFile(path.join(h.home, '.agents/skills/custom/SKILL.md'), 'Preserve global skills\n')
  for (const directory of Object.keys(manifests).filter(item => item !== '.')) {
    await writeFile(path.join(h.workspace, directory, 'index.js'), 'module.exports = 42\n')
  }
  if (options.git !== false) {
    await git(options.nested ? h.root : h.workspace, ['init'])
    await commit(options.nested ? h.root : h.workspace)
  }
  return h
}

export function runCli(h: Awaited<ReturnType<typeof fixture>>, args: string[], cwd = h.workspace) {
  return spawnSync(process.execPath, [cli, '--lang', 'en', 'workspace', 'remove', ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, HOME: h.home, USERPROFILE: h.home, NODE_ENV: 'production', NO_COLOR: '1' },
  })
}
