import type { TestContext } from 'vitest'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

export async function write(directory: string, file: string, content: string) {
  const target = path.join(directory, file)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, content)
}

export async function fixture(t: TestContext) {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'repoctl-instance-test-'))
  t.onTestFinished(async () => await fs.rm(root, { recursive: true, force: true }))
  const cwd = path.join(root, 'workspace')
  const sourceDir = path.join(root, 'historical-package')
  await write(cwd, 'package.json', '{"name":"fixture","private":true}\n')
  await write(cwd, 'pnpm-workspace.yaml', 'packages:\n  - packages/*\n')
  await write(sourceDir, 'package.json', '{"name":"@icebreakers/monorepo-templates","version":"1.2.3","scripts":{"postinstall":"exit 99"}}\n')
  await write(sourceDir, 'templates/tsdown/package.json', '{"name":"old-template","version":"1.2.3","author":"upstream"}\n')
  await write(sourceDir, 'templates/tsdown/src/index.ts', 'export const value = "original template"\n')
  await write(sourceDir, 'templates/tsdown/README.md', 'Original readme\n')
  await write(sourceDir, 'templates/tsdown/tsconfig.json', '{"extends":"../../tsconfig.json"}\n')
  await write(sourceDir, 'templates/tsdown/gitignore', 'dist\n')
  const target = 'packages/legacy'
  await write(cwd, `${target}/package.json`, '{"name":"legacy","version":"0.0.0"}\n')
  await write(cwd, `${target}/src/index.ts`, 'export const value = "business customization"\n')
  await write(cwd, `${target}/business.txt`, 'Do not change this file\n')
  return { root, cwd, sourceDir, target, options: { cwd, target, template: 'tsdown', version: '1.2.3', sourceDir } }
}

export async function contents(directory: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {}
  const visit = async (current: string) => {
    for (const item of await fs.readdir(current, { withFileTypes: true })) {
      const file = path.join(current, item.name)
      if (item.isDirectory()) {
        await visit(file)
      }
      else {
        files[path.relative(directory, file).split(path.sep).join('/')] = await fs.readFile(file, 'base64')
      }
    }
  }
  await visit(directory)
  return files
}
