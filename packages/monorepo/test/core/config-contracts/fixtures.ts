import { spawnSync } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach } from 'vitest'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
export async function fixture(config?: string, extension = 'mjs') {
  const cwd = await mkdtemp(path.join(tmpdir(), 'repoctl-config-contract-'))
  roots.push(cwd)
  if (config) {
    await writeFile(path.join(cwd, `repoctl.config.${extension}`), config)
  }
  return cwd
}
export const cli = fileURLToPath(new URL('../../../bin/repoctl.js', import.meta.url))
export function invoke(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8', timeout: 30_000, env: { ...process.env, REPOCTL_LANG: 'en' } })
}
export async function files(cwd: string) {
  return Object.fromEntries(await Promise.all((await readdir(cwd)).sort().map(async file => [file, await readFile(path.join(cwd, file), 'utf8')])))
}
