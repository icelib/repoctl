import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

export const sourceRoot = fileURLToPath(new URL('../../../../..', import.meta.url))

export async function linkToolchainPackage(cwd: string, name: string, manifest = path.join(sourceRoot, 'package.json')) {
  const directory = await fs.realpath(path.dirname(createRequire(manifest).resolve(`${name}/package.json`)))
  const target = path.join(cwd, 'node_modules', name)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.symlink(directory, target, 'junction')
  return directory
}

/** Link packages, but generate fixture-owned bins instead of relocating workspace shims. */
export async function vueToolchain(cwd: string) {
  const manifest = path.join(sourceRoot, 'templates/vue-lib/package.json')
  await linkToolchainPackage(cwd, 'vue', manifest)
  const compiler = await linkToolchainPackage(cwd, 'vue-tsc', manifest)
  const { bin } = JSON.parse(await fs.readFile(path.join(compiler, 'package.json'), 'utf8'))
  const entry = path.join(cwd, 'node_modules/vue-tsc', bin['vue-tsc'])
  const binary = path.join(cwd, 'node_modules/.bin/vue-tsc')
  const shellQuote = (value: string) => `'${value.replaceAll('\'', '\'\\\'\'')}'`
  const batchQuote = (value: string) => `"${value.replaceAll('%', '%%')}"`
  await fs.mkdir(path.dirname(binary), { recursive: true })
  await fs.writeFile(binary, `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(entry)} "$@"\n`, { mode: 0o755 })
  await fs.writeFile(`${binary}.cmd`, `@echo off\r\n${batchQuote(process.execPath)} ${batchQuote(entry)} %*\r\n@exit /b %errorlevel%\r\n`)
}
