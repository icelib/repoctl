import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import path from 'pathe'
import { afterEach } from 'vitest'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
export async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'repoctl-cache-'))
  roots.push(root)
  const data = JSON.parse(await readFile(new URL('./native-summary.json', import.meta.url), 'utf8'))
  const save = async (name: string, value: unknown) => {
    const filename = path.join(root, name)
    await writeFile(filename, JSON.stringify(value))
    return filename
  }
  return { root, data, save }
}
export function cli(cwd: string, args: string[]) {
  return execFileSync(process.execPath, [fileURLToPath(new URL('../../../bin/repo.js', import.meta.url)), 'check', ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, REPOCTL_LANG: 'en', NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}
