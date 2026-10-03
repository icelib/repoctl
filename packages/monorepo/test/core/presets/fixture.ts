import type * as Api from '../../../src/index'
import type { MonorepoConfig, OrganizationPresetManifest } from '../../../src/index'
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { execa } from 'execa'
import { afterEach } from 'vitest'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

export async function loadRepo(): Promise<typeof Api> {
  return import(pathToFileURL(path.resolve(import.meta.dirname, '../../../dist/index.mjs')).href)
}

export const manifest: OrganizationPresetManifest = { schemaVersion: 1, requires: { repoctl: '>=5 <6' } }

export async function fixture() {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'repoctl-presets-')))
  roots.push(root)
  const dependencies: Record<string, string> = {}
  async function write(relative: string, content: string) {
    const filename = path.join(root, relative)
    await mkdir(path.dirname(filename), { recursive: true })
    await writeFile(filename, content)
  }
  const json = (relative: string, value: unknown) => write(relative, `${JSON.stringify(value, null, 2)}\n`)
  const config = (value: MonorepoConfig) => write('repoctl.config.mjs', `export default ${JSON.stringify(value)}\n`)
  async function install(name: string, preset: unknown = manifest, version = '1.0.0', children: Record<string, string> = {}) {
    dependencies[name] = version
    await json('package.json', { name: 'consumer', private: true, devDependencies: dependencies })
    await json(`node_modules/${name}/package.json`, { name, version, main: 'index.cjs', exports: { '.': './index.cjs' }, dependencies: children })
    await write(`node_modules/${name}/index.cjs`, 'throw new Error("Preset JavaScript must never execute")\n')
    await json(`node_modules/${name}/repoctl.preset.json`, preset)
    return { packageName: name, version }
  }
  await json('package.json', { name: 'consumer', private: true })
  await write('pnpm-workspace.yaml', 'packages: [packages/*, apps/*]\n')
  await config({})
  return { root, write, json, config, install, read: (relative: string) => readFile(path.join(root, relative), 'utf8') }
}

export async function snapshot(root: string) {
  const files = await readdir(root, { recursive: true, withFileTypes: true })
  return Object.fromEntries(await Promise.all(files.filter(file => file.isFile()).map(async (file) => {
    const filename = path.join(file.parentPath, file.name)
    return [path.relative(root, filename), await readFile(filename, 'utf8')]
  })))
}

export function cli(cwd: string, args: string[]) {
  return execa(process.execPath, [path.resolve(import.meta.dirname, '../../../dist/cli.mjs'), ...args], { cwd, reject: false, env: { CI: 'true', FORCE_COLOR: '0', NO_COLOR: '1', NODE_ENV: 'production', CONSOLA_LEVEL: '3', TEST: undefined, VITEST: undefined } })
}
