import { mkdir, mkdtemp, readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import crossSpawn from 'cross-spawn'

export async function fixture() {
  const cwd = await realpath(await mkdtemp(path.join(tmpdir(), 'repo-release-plan-')))
  const root = JSON.parse(await readFile(new URL('../../../../../../package.json', import.meta.url), 'utf8'))
  async function write(filename: string, content: string) {
    await mkdir(path.dirname(path.join(cwd, filename)), { recursive: true })
    await writeFile(path.join(cwd, filename), content)
  }
  await write('package.json', JSON.stringify({ private: true, packageManager: root.packageManager }))
  await write('pnpm-workspace.yaml', 'packages:\n  - packages/*\nversioning:\n  fixed:\n    - [a, b]\n  changelog:\n    storage: repository\n')
  await write('repoctl.config.mjs', 'export default {commands:{release:{hooks:{beforeVersion:["node hook.cjs"]}}}}')
  await write('hook.cjs', 'require("fs").writeFileSync("HOOK_RAN", "unexpected")')
  await write('.pnpmfile.cjs', 'require("./hook.cjs"); module.exports={hooks:{updateConfig(c){return c}}}')
  for (const name of ['a', 'b', 'consumer', 'private-lib']) {
    await write(`packages/${name}/package.json`, JSON.stringify({
      name,
      version: '1.0.0',
      ...(name === 'private-lib' ? { private: true } : {}),
      ...(name === 'consumer' ? { dependencies: { a: 'workspace:^' } } : {}),
      scripts: { preversion: 'node ../../hook.cjs', version: 'node ../../hook.cjs', postversion: 'node ../../hook.cjs' },
    }))
  }
  await write('.changeset/test.md', '---\na: major\nprivate-lib: patch\n---\nAdd useful feature.\n')
  const git = (...args: string[]) => {
    const result = crossSpawn.sync('git', args, { cwd, encoding: 'utf8' })
    if (result.status !== 0) {
      throw new Error(result.stderr)
    }
    return result.stdout.trim()
  }
  git('init', '-q')
  git('config', 'user.name', 'Fixture')
  git('config', 'user.email', 'fixture@example.invalid')
  git('config', 'core.hooksPath', path.join(cwd, 'no-hooks'))
  git('add', '.')
  git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture')
  return { cwd, write, git }
}

export async function snapshot(cwd: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  async function walk(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules') {
        continue
      }
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        await walk(filename)
      }
      else if (entry.isFile()) {
        result[path.relative(cwd, filename)] = (await readFile(filename)).toString('base64')
      }
    }
  }
  await walk(cwd)
  return result
}

export function cli(cwd: string, args: string[]) {
  return crossSpawn.sync(process.execPath, [path.resolve(import.meta.dirname, '../../../../bin/repo.js'), 'release', 'plan', ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'production' },
  })
}
