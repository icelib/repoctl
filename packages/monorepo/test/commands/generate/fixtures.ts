import type { TestContext } from 'vitest'
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const sourceRoot = fileURLToPath(new URL('../../../../..', import.meta.url))
export const entry = path.join(sourceRoot, 'packages/monorepo/dist/index.mjs')
export const cli = path.join(sourceRoot, 'packages/monorepo/dist/cli.mjs')

export async function write(root: string, relative: string, content: object | string) {
  const file = path.join(root, relative)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, typeof content === 'string' ? content : JSON.stringify(content))
}

export async function fixture(t: TestContext) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'repoctl-generate-')))
  t.onTestFinished(() => rm(root, { recursive: true, force: true }))
  await write(root, 'package.json', { name: 'generator-fixture', private: true, type: 'module', devDependencies: { vitest: '*' } })
  await write(root, 'pnpm-workspace.yaml', 'packages: [packages/*]\n')
  for (const [name, dependency] of [['vue', 'vue'], ['react', 'react'], ['server', 'hono']]) {
    await write(root, `packages/${name}/package.json`, { name: `@fixture/${name}`, type: 'module', private: true, dependencies: { [dependency!]: '*' } })
    await write(root, `packages/${name}/src/index.ts`, '// Existing business exports.\nexport const existing = 42\n')
  }
  await symlink(path.join(sourceRoot, 'node_modules'), path.join(root, 'node_modules'), 'junction')
  return root
}
