import type * as Api from '../../../src/index'
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

export async function fixture(create: Record<string, unknown> = {}) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'repoctl-catalog-')))
  roots.push(root)
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture', private: true }))
  await writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n  - apps/*\n')
  await writeFile(path.join(root, 'repoctl.config.mjs'), `export default ${JSON.stringify({ commands: { create } })}\n`)
  return root
}

export async function template(root: string, relative: string, text = 'export const custom = true\n') {
  const source = path.join(root, relative)
  await mkdir(source, { recursive: true })
  await writeFile(path.join(source, 'package.json'), JSON.stringify({ name: 'template', version: '1.0.0' }))
  await writeFile(path.join(source, 'index.mjs'), text)
  return source
}

export async function snapshot(root: string) {
  const files = await readdir(root, { recursive: true, withFileTypes: true })
  const entries = await Promise.all(files.filter(entry => entry.isFile()).map(async (entry) => {
    const filename = path.join(entry.parentPath, entry.name)
    return [path.relative(root, filename).replaceAll('\\', '/'), await readFile(filename, 'utf8')] as const
  }))
  return Object.fromEntries(entries.sort(([left], [right]) => left.localeCompare(right)))
}

export function cli(cwd: string, args: string[]) {
  return execa(process.execPath, [path.resolve(import.meta.dirname, '../../../dist/cli.mjs'), ...args], { cwd, reject: false, env: { FORCE_COLOR: '0', NO_COLOR: '1', NODE_ENV: 'production', CONSOLA_LEVEL: '3', TEST: undefined, VITEST: undefined } })
}
