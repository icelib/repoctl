import type { PackedPackage } from '../../package-check/types'
import { isBuiltin } from 'node:module'
import { build } from 'esbuild'

export async function checkConditionalDependencies(packed: PackedPackage) {
  const { createPackageFromTarballData } = await import('@arethetypeswrong/core')
  const pkg = createPackageFromTarballData(packed.bytes)
  const declared = new Set(Object.keys({ ...packed.manifest.dependencies, ...packed.manifest.optionalDependencies, ...packed.manifest.peerDependencies }))
  const manifest = JSON.parse(pkg.readFile(`/node_modules/${pkg.packageName}/package.json`))
  function inspectImports(value: unknown) {
    if (typeof value === 'string' && !value.startsWith('.') && !value.startsWith('#') && !isBuiltin(value)) {
      const name = value.startsWith('@') ? value.split('/').slice(0, 2).join('/') : value.split('/')[0]!
      if (name !== pkg.packageName && !declared.has(name)) {
        packed.result.diagnostics.push({ source: 'repoctl', code: 'UNDECLARED_RUNTIME_DEPENDENCY', severity: 'error', file: 'package.json#imports', message: `Package import maps to undeclared runtime dependency: ${value}` })
      }
    }
    else if (value && typeof value === 'object') {
      Object.values(value).forEach(inspectImports)
    }
  }
  inspectImports(manifest.imports)
  for (const file of packed.result.files.filter(file => /\.[cm]?js$/u.test(file))) {
    await build({
      stdin: { contents: pkg.readFile(`/node_modules/${pkg.packageName}/${file}`), sourcefile: file, loader: 'js' },
      write: false,
      bundle: true,
      treeShaking: false,
      platform: 'neutral',
      logLevel: 'silent',
      plugins: [{
        name: 'template-runtime-dependencies',
        setup(context) {
          context.onResolve({ filter: /.*/ }, (args) => {
            const name = args.path.startsWith('@') ? args.path.split('/').slice(0, 2).join('/') : args.path.split('/')[0]!
            if (!args.path.startsWith('.') && !args.path.startsWith('#') && !isBuiltin(args.path) && name !== pkg.packageName && !declared.has(name)) {
              packed.result.diagnostics.push({ source: 'repoctl', code: 'UNDECLARED_RUNTIME_DEPENDENCY', severity: 'error', file, message: `Packed JavaScript imports ${args.path}, which is absent from dependencies, optionalDependencies and peerDependencies.` })
            }
            return { path: args.path, external: true }
          })
        },
      }],
    })
  }
}
