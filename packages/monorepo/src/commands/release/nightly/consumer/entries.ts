import type { PackedManifest } from '../../../package-check/types'
import type { consumerRunner } from './run'
import { realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { consumerEntries } from '../../../package-check/entries'

export async function checkInstalledEntries(manifest: PackedManifest, files: string[], installed: string, directory: string, run: ReturnType<typeof consumerRunner>, packageIndex: number) {
  const entries = consumerEntries(manifest, files)
  const checkTypes = files.some(file => /\.d\.[cm]?ts$/u.test(file))
  const require = createRequire(import.meta.resolve('@arethetypeswrong/core/package.json'))
  const tsc = require.resolve('typescript/bin/tsc')
  for (const [index, entry] of entries.entries()) {
    const specifier = `${manifest.name}${entry.subpath === '.' ? '' : entry.subpath.slice(1)}`
    if (entry.runtime) {
      const source = entry.format === 'esm' ? `await import(${JSON.stringify(specifier)})` : `require(${JSON.stringify(specifier)})`
      await run(process.execPath, ['--input-type', entry.format === 'esm' ? 'module' : 'commonjs', '--eval', source])
    }
    if (checkTypes) {
      const file = `consume-${packageIndex}-${index}.${entry.format === 'esm' ? 'mts' : 'cts'}`
      const importText = !entry.runtime ? `import type * as subject from ${JSON.stringify(specifier)}` : entry.format === 'esm' ? `import * as subject from ${JSON.stringify(specifier)}` : `import subject = require(${JSON.stringify(specifier)})`
      await writeFile(path.join(directory, file), `${importText};\ntype Consumer = typeof subject;\n`)
      await run(process.execPath, [tsc, '--noEmit', '--strict', '--skipLibCheck', 'false', '--module', 'nodenext', '--target', 'es2022', '--types', 'node', file])
    }
  }
  for (const bin of typeof manifest.bin === 'string' ? [manifest.bin] : Object.values(manifest.bin ?? {})) {
    if (typeof bin === 'string' && /\.[cm]?js$/u.test(bin)) {
      const filename = await realpath(path.resolve(installed, bin))
      const relative = path.relative(installed, filename)
      if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error(`Nightly consumer resolved a bin outside its isolated package: ${manifest.name}.`)
      }
      await run(process.execPath, ['--check', filename])
    }
  }
}
