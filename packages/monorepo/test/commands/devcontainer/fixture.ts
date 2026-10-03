import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import process from 'node:process'
import path from 'pathe'
import { afterEach } from 'vitest'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

export async function fixture(overrides: Record<string, unknown> = {}) {
  const parent = path.resolve(await realpath(await mkdtemp(path.join(tmpdir(), 'repoctl-container-'))))
  roots.push(parent)
  const root = path.join(parent, 'workspace')
  const leaf = path.join(root, 'packages/library')
  await mkdir(leaf, { recursive: true })
  const manifest = { name: 'container-fixture', private: true, packageManager: 'pnpm@12.8.1', engines: { node: '>=22.13.0' }, ...overrides }
  await writeFile(path.join(root, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  await writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages: [packages/*]\n')
  await writeFile(path.join(leaf, 'package.json'), '{"name":"library","version":"1.0.0"}\n')
  return { parent, root, leaf, manifest }
}

export async function snapshot(root: string) {
  const result: Record<string, string> = {}
  async function visit(directory: string) {
    for (const name of (await readdir(directory)).sort()) {
      const filename = path.join(directory, name)
      const info = await lstat(filename)
      if (info.isDirectory()) {
        result[path.relative(root, filename)] = 'directory'
        await visit(filename)
      }
      else {
        result[path.relative(root, filename)] = `${info.mode}:${info.mtimeMs}:${createHash('sha256').update(await readFile(filename)).digest('hex')}`
      }
    }
  }
  await visit(root)
  return result
}

export function cli(cwd: string, args: string[], locale = 'en') {
  return spawnSync(process.execPath, [path.resolve(import.meta.dirname, '../../../bin/repoctl.js'), '--lang', locale, 'tooling', 'devcontainer', ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 30000,
    env: { ...process.env, NODE_ENV: 'production', CONSOLA_LEVEL: '3', NO_COLOR: '1' },
  })
}
