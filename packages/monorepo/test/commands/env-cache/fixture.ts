import type { TestContext } from 'vitest'
import { spawnSync } from 'node:child_process'
import { lstat, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import path from 'pathe'

export const sourceRoot = fileURLToPath(new URL('../../../../..', import.meta.url))
export async function fixture(t: TestContext) {
  const root = path.resolve(await realpath(await mkdtemp(path.join(tmpdir(), 'repoctl-env-cache-'))))
  t.onTestFinished(() => rm(root, { recursive: true, force: true }))
  const write = async (filename: string, content: object | string) => {
    await mkdir(path.dirname(path.join(root, filename)), { recursive: true })
    await writeFile(path.join(root, filename), typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`)
  }
  await write('package.json', { name: 'env-fixture', private: true, packageManager: 'pnpm@12.8.1' })
  await write('pnpm-workspace.yaml', 'packages: [packages/*]\n')
  await write('pnpm-lock.yaml', 'lockfileVersion: "9.0"\nimporters:\n  .: {}\n  packages/app: {}\n')
  await write('packages/app/package.json', { name: '@test/app', private: true, scripts: { build: 'node -e ""', dev: 'node -e ""' }, devDependencies: { vite: '*' } })
  await write('turbo.json', { tasks: { build: { inputs: ['$TURBO_DEFAULT$', '.env*'] }, dev: { cache: false } } })
  const git = (...args: string[]) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })
  git('init', '-q')
  return { root, write, git }
}

export async function snapshot(root: string) {
  const entries: Array<[string, string]> = []
  async function visit(directory: string) {
    for (const name of (await readdir(directory)).sort()) {
      const target = path.join(directory, name)
      const info = await lstat(target)
      if (info.isDirectory()) {
        await visit(target)
      }
      else {
        entries.push([path.relative(root, target), `${info.mode}:${info.mtimeMs}:${(await readFile(target)).toString('base64')}`])
      }
    }
  }
  await visit(root)
  return entries
}

export function cli(root: string, args: string[]) {
  return spawnSync(process.execPath, [path.join(sourceRoot, 'packages/monorepo/bin/repoctl.js'), '--lang', 'en', 'env', 'check', ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, NODE_ENV: 'production', NO_COLOR: '1' }, timeout: 30000 })
}
