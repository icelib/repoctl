import { spawnSync } from 'node:child_process'
import { lstat, mkdir, mkdtemp, readdir, readFile, readlink, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import process from 'node:process'
import path from 'pathe'
import { afterEach } from 'vitest'

const roots: string[] = []
const cli = path.resolve(import.meta.dirname, '../../../bin/repoctl.js')

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

export async function writeJson(file: string, value: object) {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`)
}

export async function fixture(manifests: Record<string, object> = {}) {
  const root = path.resolve(await realpath(await mkdtemp(path.join(tmpdir(), 'repoctl deps '))))
  roots.push(root)
  const workspace = path.join(root, 'workspace')
  const home = path.join(root, 'home')
  await mkdir(home)
  await writeJson(path.join(workspace, 'package.json'), { name: 'fixture', private: true, ...manifests['.'] })
  await writeFile(path.join(workspace, 'pnpm-workspace.yaml'), 'packages: [packages/*]\n')
  for (const [dir, manifest] of Object.entries(manifests)) {
    if (dir !== '.') {
      await writeJson(path.join(workspace, dir, 'package.json'), { name: path.basename(dir), private: true, ...manifest })
    }
  }
  return { root, workspace, home }
}

export async function policy(workspace: string, groups: object[]) {
  await writeFile(path.join(workspace, 'repoctl.config.mjs'), `export default ${JSON.stringify({ commands: { deps: { groups } } })}\n`)
}

export function runCli(h: Awaited<ReturnType<typeof fixture>>, args: string[], cwd = h.workspace, lang = 'en') {
  return spawnSync(process.execPath, [cli, '--lang', lang, 'deps', ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, HOME: h.home, USERPROFILE: h.home, NODE_ENV: 'production', CONSOLA_LEVEL: '3', NO_COLOR: '1' },
  })
}

export async function snapshot(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  async function walk(dir: string) {
    for (const name of (await readdir(dir)).sort()) {
      const file = path.join(dir, name)
      const entry = await lstat(file)
      const relative = path.relative(root, file)
      if (entry.isSymbolicLink()) {
        result[relative] = `link:${await readlink(file)}`
      }
      else if (entry.isDirectory()) {
        result[relative] = 'directory'
        await walk(file)
      }
      else {
        result[relative] = `${entry.mtimeMs}:${await readFile(file, 'utf8')}`
      }
    }
  }
  await walk(root)
  return result
}
