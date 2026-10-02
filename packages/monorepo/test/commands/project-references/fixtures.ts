import type { TestContext } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const sourceRoot = fileURLToPath(new URL('../../../../..', import.meta.url))

export async function write(root: string, file: string, content: string | object) {
  await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true })
  await fs.writeFile(path.join(root, file), typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`)
}

export async function settings(root: string, value: object = { enabled: true }) {
  await write(root, 'repoctl.config.mjs', `export default ${JSON.stringify({ tooling: { projectReferences: value } })}\n`)
}

export async function project(root: string, name: string, config = 'tsconfig.json', options: object = {}) {
  await write(root, `packages/${name}/package.json`, { name: `@fixture/${name}`, version: '1.0.0', private: true, type: 'module' })
  await write(root, `packages/${name}/${config}`, { extends: '../../base.json', compilerOptions: { outDir: `dist-${config}`, rootDir: 'src', ...options }, include: ['src'] })
  await write(root, `packages/${name}/src/index.ts`, 'export const value = 42\n')
}

export async function fixture(t: TestContext, enabled = true) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'repoctl-references-')))
  t.onTestFinished(async () => fs.rm(root, { recursive: true, force: true }))
  await write(root, 'package.json', { name: 'references-fixture', private: true, type: 'module' })
  await write(root, 'pnpm-workspace.yaml', 'packages:\n  - packages/*\n')
  await write(root, 'base.json', { compilerOptions: { composite: true, declaration: true, target: 'ESNext', module: 'NodeNext', types: [], skipLibCheck: true } })
  await write(root, 'tsconfig.json', '{\n  // Keep this solution comment.\n  "files": [],\n  "references": []\n}\n')
  await fs.symlink(path.join(sourceRoot, 'node_modules'), path.join(root, 'node_modules'), 'junction')
  await project(root, 'lib')
  await project(root, 'app')
  if (enabled) {
    await settings(root)
  }
  return root
}

export async function bytes(root: string, files: string[]) {
  return Promise.all(files.map(async file => [file, await fs.readFile(path.join(root, file), 'utf8')]))
}
