import type { Plugin } from 'esbuild'
import { readFile } from 'node:fs/promises'
import nativePath from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import path from 'pathe'

const preserveModulePaths: Plugin = {
  name: 'repoctl-config-module-paths',
  setup(plugin) {
    plugin.onLoad({ filter: /\.[cm]?[jt]s$/ }, async ({ path: filename }) => {
      const source = (await readFile(filename, 'utf8')).replace(/^#![^\n]*(?:\n|$)/, '')
      const directory = nativePath.dirname(filename)
      const prefix = `const __repoctl_filename = ${JSON.stringify(filename)}; const __repoctl_dirname = ${JSON.stringify(directory)}; const __repoctl_url = ${JSON.stringify(pathToFileURL(filename).href)};\n`
      return { contents: prefix + source, loader: /\.[cm]?ts$/.test(filename) ? 'ts' : 'js' }
    })
  },
}

/** Compile local configuration modules in memory; installed packages stay external. */
export async function bundleConfig(filename: string) {
  const cwd = path.dirname(filename)
  const result = await build({
    entryPoints: [filename],
    absWorkingDir: cwd,
    bundle: true,
    write: false,
    metafile: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    treeShaking: false,
    logLevel: 'silent',
    define: {
      '__filename': '__repoctl_filename',
      '__dirname': '__repoctl_dirname',
      'import.meta.filename': '__repoctl_filename',
      'import.meta.dirname': '__repoctl_dirname',
      'import.meta.url': '__repoctl_url',
    },
    plugins: [preserveModulePaths],
  })
  return {
    code: result.outputFiles[0]!.text,
    files: Object.keys(result.metafile.inputs).map(file => path.resolve(cwd, file)),
  }
}
