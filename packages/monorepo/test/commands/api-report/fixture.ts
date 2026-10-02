import { spawnSync } from 'node:child_process'
import { mkdir, realpath, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import process from 'node:process'
import path from 'pathe'
import { expect } from 'vitest'
import { fixture, snapshot, writeJson } from '../deps/fixture'

const require = createRequire(import.meta.url)
export { snapshot, writeJson }
export const source = '/** @public */\nexport function greet(name: string): string { return "hi " + name }\nconst internalSecret = 42; void internalSecret;\n'

export async function config(root: string, entries: object = { '.': { entryPoint: 'dist/index.d.ts', baseline: 'etc/sdk.api.md' } }) {
  await writeFile(path.join(root, 'repoctl.config.mjs'), `export default ${JSON.stringify({ tooling: { apiReports: { '@test/sdk': { entries } } } })}\n`)
}

export async function build(root: string) {
  const result = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', path.join(root, 'packages/sdk/tsconfig.json')], { encoding: 'utf8' })
  expect(result.status, result.stdout + result.stderr).toBe(0)
}

export function cli(root: string, args: string[]) {
  return spawnSync(process.execPath, [path.resolve(import.meta.dirname, '../../../bin/repoctl.js'), 'package', 'api', ...args], { cwd: root, encoding: 'utf8', timeout: 30_000, env: { ...process.env, NO_COLOR: '1', CONSOLA_LEVEL: '0' } })
}

export async function setup(options: { tool?: boolean, config?: boolean } = {}) {
  const { workspace: root } = await fixture({ 'packages/sdk': { name: '@test/sdk', private: false, version: '1.0.0', types: './dist/index.d.ts', exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' }, './feature': { types: './dist/feature.d.ts' } } } })
  await mkdir(path.join(root, 'packages/sdk/src'), { recursive: true })
  await writeJson(path.join(root, 'packages/sdk/tsconfig.json'), { compilerOptions: { declaration: true, emitDeclarationOnly: true, rootDir: 'src', outDir: 'dist', skipLibCheck: true, target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext' }, include: ['src'] })
  await writeFile(path.join(root, 'packages/sdk/src/index.ts'), source)
  await writeFile(path.join(root, 'packages/sdk/src/feature.ts'), '/** @public */\nexport interface Feature { enabled: boolean }\n')
  await build(root)
  if (options.tool !== false) {
    const target = await realpath(path.dirname(require.resolve('@microsoft/api-extractor/package.json')))
    await mkdir(path.join(root, 'node_modules/@microsoft'), { recursive: true })
    await symlink(target, path.join(root, 'node_modules/@microsoft/api-extractor'), process.platform === 'win32' ? 'junction' : 'dir')
  }
  if (options.config !== false) {
    await config(root)
  }
  return root
}
