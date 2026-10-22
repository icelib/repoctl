import type { Format, UserConfig } from 'tsdown'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { build } from 'tsdown'
import { antfuDeclarationHooks, antfuDeclarationVersion, antfuLicenseCopy, correctAntfuDeclarations } from '../declarations/antfu'

vi.mock('node:fs/promises', async (original) => {
  const filesystem = await original<typeof import('node:fs/promises')>()
  return { ...filesystem, copyFile: vi.fn(filesystem.copyFile) }
})

const packageRoot = path.resolve(import.meta.dirname, '..')
const require = createRequire(import.meta.url)
const dependencyRoot = path.dirname(require.resolve('@antfu/eslint-config/package.json'))
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture(formats: Format[] = ['esm', 'cjs']) {
  const root = await mkdtemp(path.join(tmpdir(), 'repoctl-antfu-build-'))
  roots.push(root)
  const entry = path.join(root, 'index.js')
  await writeFile(entry, 'export const value = true\n')
  const [declarations, license] = await Promise.all([
    readFile(path.join(dependencyRoot, 'dist/index.d.mts'), 'utf8'),
    readFile(path.join(dependencyRoot, 'LICENSE'), 'utf8'),
  ])
  const copies = vi.fn(antfuLicenseCopy)
  const done = vi.fn(antfuDeclarationHooks()['build:done']!)

  function options(outDir = path.join(root, 'dist'), overlap = true): UserConfig {
    const allFormatsReady = Promise.withResolvers<void>()
    let ready = 0
    return {
      cwd: packageRoot,
      entry: { index: entry },
      format: formats,
      outDir,
      dts: false,
      clean: true,
      fixedExtension: false,
      logLevel: 'silent',
      copy: copies,
      hooks: {
        ...antfuDeclarationHooks(),
        'build:before': ({ options, buildOptions }) => {
          // Emit the reviewed upstream declarations without invoking the type bundler.
          buildOptions.plugins = [buildOptions.plugins, {
            name: 'antfu-declaration-fixture',
            generateBundle() {
              this.emitFile({
                type: 'asset',
                fileName: options.format === 'es' ? 'index.d.ts' : 'index.d.cts',
                source: declarations,
              })
            },
          }]
        },
        'build:done': async (context) => {
          if (++ready === formats.length) {
            allFormatsReady.resolve()
          }
          if (overlap) {
            await allFormatsReady.promise
          }
          await done(context)
        },
      },
    }
  }

  async function verify(outDir = path.join(root, 'dist')) {
    expect(await readFile(path.join(outDir, 'ANTFU-LICENSE'), 'utf8')).toBe(license)
    for (const format of formats) {
      const extension = format === 'cjs' ? 'cts' : 'ts'
      const content = await readFile(path.join(outDir, `index.d.${extension}`), 'utf8')
      expect(content).toBe(`// Includes @antfu/eslint-config ${antfuDeclarationVersion} declarations (MIT); see ANTFU-LICENSE.\n${correctAntfuDeclarations(declarations, antfuDeclarationVersion)}`)
    }
  }

  return { root, copies, done, options, verify, license }
}

it('copies one shared license when both declaration hooks overlap and refreshes it on rebuild', async () => {
  const h = await fixture()
  expect(await readFile(path.join(packageRoot, 'dist/ANTFU-LICENSE'), 'utf8')).toBe(h.license)
  await build({ ...h.options(), config: false })
  expect(h.done).toHaveBeenCalledTimes(2)
  expect(h.copies).toHaveBeenCalledTimes(1)
  // Source hooks must not introduce another writer outside tsdown's native copy stage.
  expect(copyFile).not.toHaveBeenCalled()
  await h.verify()

  await writeFile(path.join(h.root, 'dist/ANTFU-LICENSE'), 'stale license')
  await build({ ...h.options(), config: false })
  expect(h.done).toHaveBeenCalledTimes(4)
  expect(h.copies).toHaveBeenCalledTimes(2)
  await h.verify()
})

it.each<Format>(['esm', 'cjs'])('preserves the license in a standalone %s build', async (format) => {
  const h = await fixture([format])
  await build({ ...h.options(), config: false })
  expect(h.copies).toHaveBeenCalledTimes(1)
  await h.verify()
})

it('copies a license to each independent output directory with CJS first', async () => {
  const h = await fixture(['cjs', 'esm'])
  const directories = [path.join(h.root, 'one'), path.join(h.root, 'two')]
  await Promise.all(directories.map(outDir => build({ ...h.options(outDir), config: false })))
  expect(h.copies.mock.calls.map(([options]) => options.outDir).sort()).toEqual(directories.sort())
  await Promise.all(directories.map(outDir => h.verify(outDir)))
})

it('propagates a license copy failure without suppressing a later successful build', async () => {
  const h = await fixture(['esm'])
  const outDir = path.join(h.root, 'dist')
  // A directory at the license target forces a real filesystem copy error on every OS.
  await mkdir(path.join(outDir, 'ANTFU-LICENSE'), { recursive: true })
  await expect(build({ ...h.options(outDir, false), config: false, clean: false })).rejects.toThrow()
  expect(h.copies).toHaveBeenCalledTimes(1)
  await build({ ...h.options(), config: false })
  expect(h.copies).toHaveBeenCalledTimes(2)
  await h.verify()
})
