import type { InstalledConsumerTypeToolchain } from '../../../package-check/consumer/typescript'
import type { PackedManifest } from '../../../package-check/types'
import type { consumerRunner } from './run'
import { realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { consumerRuntimeInvocation } from '../../../package-check/consumer/runtime-contexts'
import { consumerEntries } from '../../../package-check/entries'

export async function checkInstalledEntries(manifest: PackedManifest, files: string[], installed: string, directory: string, run: ReturnType<typeof consumerRunner>, packageIndex: number, toolchain?: InstalledConsumerTypeToolchain) {
  const entries = consumerEntries(manifest, files)
  const checkTypes = files.some(file => /\.d\.[cm]?ts$/u.test(file))
  for (const [index, entry] of entries.entries()) {
    const specifier = `${manifest.name}${entry.subpath === '.' ? '' : entry.subpath.slice(1)}`
    if (entry.runtime) {
      await run(process.execPath, await consumerRuntimeInvocation(entry, specifier, directory, installed))
      if (entry.asset) {
        await run(process.execPath, ['--check', path.resolve(installed, entry.target)])
      }
    }
    if (checkTypes && entry.typecheck !== false) {
      if (!toolchain) {
        throw new Error('Nightly consumer requires its isolated TypeScript compiler for declaration checks.')
      }
      const file = `consume-${packageIndex}-${index}.${entry.format === 'esm' ? 'mts' : 'cts'}`
      const importText = !entry.runtime ? `import type * as subject from ${JSON.stringify(specifier)}` : entry.format === 'esm' ? `import * as subject from ${JSON.stringify(specifier)}` : `import subject = require(${JSON.stringify(specifier)})`
      await writeFile(path.join(directory, file), `${importText};\ntype Consumer = typeof subject;\n`)
      await run(process.execPath, [toolchain.tsc, '--noEmit', '--strict', '--skipLibCheck', 'false', '--module', 'nodenext', '--target', 'es2022', '--typeRoots', toolchain.typeRoots, '--types', toolchain.nodeTypes, file])
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
