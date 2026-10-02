import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { execa } from 'execa'
import { afterEach } from 'vitest'

const roots: string[] = []
export const trackRoot = (root: string) => roots.push(root)
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
export const loadRepo = (): Promise<typeof import('../../../src/index')> => import(pathToFileURL(path.resolve(import.meta.dirname, '../../../dist/index.mjs')).href)
export const cliPath = path.resolve(import.meta.dirname, '../../../dist/cli.mjs')
export const cli = (cwd: string, args: string[]) => execa(process.execPath, [cliPath, ...args], { cwd, reject: false, env: { CI: 'true', TEST: undefined, VITEST: undefined, NODE_ENV: 'production', FORCE_COLOR: '0' } })
export const exists = (file: string) => readFile(file).then(() => true).catch(() => false)
export const json = async (file: string) => JSON.parse(await readFile(file, 'utf8'))

export async function fixture(options: { scripts?: Record<string, string>, files?: Record<string, string>, exports?: unknown, imports?: unknown, category?: string } = {}) {
  const cwd = await realpath(await mkdtemp(path.join(tmpdir(), 'repoctl-template-author-')))
  roots.push(cwd)
  const sourceDir = path.join(cwd, 'templates/sample')
  const fixtureDir = path.join(cwd, 'workspace')
  await mkdir(sourceDir, { recursive: true })
  await mkdir(fixtureDir)
  const root = await json(path.resolve(import.meta.dirname, '../../../../../package.json'))
  await writeFile(path.join(cwd, 'package.json'), JSON.stringify({ name: 'author', private: true }))
  await writeFile(path.join(cwd, 'pnpm-workspace.yaml'), 'packages: []\n')
  await writeFile(path.join(cwd, 'repoctl.config.mjs'), `export default ${JSON.stringify({ commands: { create: { templatesDir: './templates', templateMap: { custom: { source: 'sample', target: 'packages/example', category: options.category ?? 'library' } } } } })}`)
  await writeFile(path.join(fixtureDir, 'package.json'), JSON.stringify({ name: 'fixture', private: true, packageManager: root.packageManager }))
  await writeFile(path.join(fixtureDir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
  await writeFile(path.join(sourceDir, 'package.json'), JSON.stringify({
    name: 'author-template',
    version: '1.0.0',
    private: true,
    type: 'module',
    license: 'MIT',
    files: ['dist'],
    exports: options.exports ?? { '.': './dist/index.js' },
    ...(options.imports ? { imports: options.imports } : {}),
    scripts: { build: 'node tasks.mjs build', lint: 'node tasks.mjs lint', test: 'node tasks.mjs test', ...options.scripts },
  }))
  const files = {
    'index.js': 'export const value = 42\n',
    'tasks.mjs': `import { appendFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs'
import assert from 'node:assert/strict'
const task = process.argv[2]
appendFileSync('execution.txt', task + '\\n')
if (task === 'build') { mkdirSync('dist', {recursive: true}); copyFileSync('index.js', 'dist/index.js') }
if (task === 'lint') assert.ok(existsSync('dist/index.js'))
if (task === 'test') assert.equal((await import('./dist/index.js')).value, 42)
`,
    ...options.files,
  }
  for (const [file, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(sourceDir, file)), { recursive: true })
    await writeFile(path.join(sourceDir, file), text)
  }
  return { cwd, sourceDir, fixtureDir, template: 'custom' }
}
