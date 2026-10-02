import { spawnSync } from 'node:child_process'
import { lstat, mkdir, mkdtemp, readdir, readFile, readlink, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import process from 'node:process'
import path from 'pathe'
import { afterEach } from 'vitest'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

export async function fixture() {
  const root = path.resolve(await realpath(await mkdtemp(path.join(tmpdir(), 'upgrade plan '))))
  roots.push(root)
  const cwd = path.join(root, 'workspace')
  await mkdir(cwd)
  async function write(filename: string, content: string | Uint8Array) {
    const target = path.join(cwd, filename)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, content)
  }
  await write('package.json', `${JSON.stringify({ name: 'fixture', private: true, scripts: { custom: 'echo keep' }, devDependencies: { repoctl: 'workspace:*' } }, null, 2)}\n`)
  await write('pnpm-workspace.yaml', 'packages: [packages/*]\ncatalog:\n  vue: ^3.0.0\n')
  await write('packages/a/package.json', '{"name":"a","version":"1.0.0"}\n')
  await write('packages/private/package.json', '{"name":"private","version":"1.0.0","private":true}\n')
  await write('unrelated.txt', 'keep exactly\n')
  const git = (...args: string[]) => spawnSync('git', args, { cwd, encoding: 'utf8' })
  git('init', '-q')
  // Keep background Git maintenance from racing the read-only filesystem assertions.
  git('config', 'maintenance.auto', 'false')
  git('config', 'gc.auto', '0')
  git('config', 'user.name', 'Fixture')
  git('config', 'user.email', 'fixture@example.invalid')
  git('config', 'core.hooksPath', path.join(root, 'no-hooks'))
  git('remote', 'add', 'origin', 'https://github.com/fixture/repository.git')
  git('add', '.')
  git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture')
  return { root, cwd, write, git }
}

export function cli(cwd: string, args: string[], command: string[] = ['upgrade']) {
  return spawnSync(process.execPath, [path.resolve(import.meta.dirname, '../../../../bin/repoctl.js'), '--lang', 'en', ...command, ...args], { cwd, encoding: 'utf8', env: { ...process.env, NODE_ENV: 'production', NO_COLOR: '1' }, timeout: 30000 })
}

export async function snapshot(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  async function walk(directory: string) {
    for (const name of (await readdir(directory)).sort()) {
      const target = path.join(directory, name)
      const info = await lstat(target)
      const relative = path.relative(root, target)
      if (info.isSymbolicLink()) {
        result[relative] = `link:${await readlink(target)}`
      }
      else if (info.isDirectory()) {
        result[relative] = 'directory'
        await walk(target)
      }
      else {
        result[relative] = `${info.mode}:${info.mtimeMs}:${(await readFile(target)).toString('base64')}`
      }
    }
  }
  await walk(root)
  return result
}
