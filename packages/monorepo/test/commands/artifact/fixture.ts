import { execFile, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import process from 'node:process'
import { promisify } from 'node:util'
import spawn from 'cross-spawn'
import path from 'pathe'
import { afterEach } from 'vitest'

const roots: string[] = []
const require = createRequire(import.meta.url)
export const manager = '12.8.1'
const guards = ['--config.pm-on-fail=ignore', '--config.runtime-on-fail=ignore', '--config.manage-package-manager-versions=false', '--config.ignore-pnpmfile=true', '--config.ignore-scripts=true']
const cli = path.resolve(import.meta.dirname, '../../../bin/repoctl.js')

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

export async function json(root: string, relative: string, value: unknown) {
  const filename = path.join(root, relative)
  await mkdir(path.dirname(filename), { recursive: true })
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`)
}

export async function fixture() {
  const parent = path.resolve(await realpath(await mkdtemp(path.join(tmpdir(), 'repoctl-artifact-test-'))))
  roots.push(parent)
  const root = path.join(parent, 'source')
  await mkdir(root)
  await json(root, 'package.json', { name: 'artifact-fixture', private: true, packageManager: `pnpm@${manager}` })
  await writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
  await writeFile(path.join(root, '.gitignore'), 'node_modules/\n.env\n')
  await writeFile(path.join(root, '.env'), 'TOKEN=SECRET-SENTINEL\n')
  await writeFile(path.join(root, '.npmrc'), '//registry.example.invalid/:_authToken=AUTH-SENTINEL\n')
  for (const [name, config, code] of [
    ['service', { dependencies: { core: 'workspace:*' }, devDependencies: { 'build-only': 'workspace:*' } }, 'console.log(require("core"))'],
    ['core', {}, 'module.exports = "portable artifact"'],
    ['build-only', {}, 'module.exports = "build tool"'],
    ['unrelated', {}, 'module.exports = "unrelated"'],
  ] as const) {
    await json(root, `packages/${name}/package.json`, { name, version: '1.0.0', main: 'dist/index.js', files: ['dist', '.env', '.env.example'], ...config })
    await mkdir(path.join(root, `packages/${name}/dist`))
    await writeFile(path.join(root, `packages/${name}/dist/index.js`), `${code}\n`)
    await writeFile(path.join(root, `packages/${name}/source.js`), `${code}\n`)
  }
  await writeFile(path.join(root, 'packages/service/.env'), 'TOKEN=APP-SECRET-SENTINEL\n')
  await writeFile(path.join(root, 'packages/service/.env.example'), 'TOKEN=replace-me\n')
  const installed = spawn.sync('pnpm', [...guards, 'install', '--lockfile-only', '--offline', '--ignore-scripts'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30000,
    env: { ...process.env, COREPACK_ENABLE_NETWORK: '0', COREPACK_ENABLE_AUTO_PIN: '0' },
  })
  if (installed.error || installed.status !== 0) {
    throw new Error(`Fixture lockfile failed: ${installed.error?.message ?? installed.stderr}`)
  }
  await mkdir(path.join(root, 'node_modules'), { recursive: true })
  await symlink(path.dirname(require.resolve('turbo/package.json')), path.join(root, 'node_modules/turbo'), process.platform === 'win32' ? 'junction' : 'dir')
  return { parent, root, output: path.join(parent, 'output') }
}

export async function snapshot(root: string) {
  const files: Record<string, string> = {}
  async function visit(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (['node_modules', '.repoctl'].includes(entry.name)) {
        continue
      }
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        await visit(filename)
      }
      else {
        files[path.relative(root, filename)] = createHash('sha256').update(await readFile(filename)).digest('hex')
      }
    }
  }
  await visit(root)
  return files
}

export const node = promisify(execFile)

export function runCli(root: string, args: string[]) {
  return spawnSync(process.execPath, [cli, '--lang', 'en', 'workspace', 'prepare', ...args], { cwd: root, encoding: 'utf8', timeout: 30000 })
}
