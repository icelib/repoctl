import type { ExpectedWorkspaceLocators } from './consumer/dependencies'
import type { ConsumerEntry, PackageCheckResult, PackedPackage } from './types'
import { mkdir, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { stringify } from 'yaml'
import { checkDependencyRanges, consumerDependency } from './consumer/dependencies'
import { consumerOptionalPeers } from './consumer/optional-peers'
import { resolveConsumerPeerAliases } from './consumer/peer-aliases'
import { consumerApplicability } from './consumer/platform'
import { consumerAssetSource } from './consumer/runtime-assets'
import { consumerRuntimeClosure } from './consumer/runtime-closure'
import { consumerTypeToolchain, installedConsumerTypeToolchain } from './consumer/typescript'
import { dependencyReferences } from './dependencies'
import { execute, failureMessage } from './process'

export async function consumeTarball(pkg: PackedPackage, packages: PackedPackage[], results: PackageCheckResult[], entries: ConsumerEntry[], directory: string, timeout: number, options: { env?: NodeJS.ProcessEnv, signal?: AbortSignal | undefined, packageManager?: string, expectedWorkspaceLocators?: ExpectedWorkspaceLocators } = {}) {
  const { result } = pkg
  const { packageManager } = options
  checkDependencyRanges(pkg, packages, results, options.expectedWorkspaceLocators)
  result.applicability = consumerApplicability(pkg.manifest)
  if (result.diagnostics.some(item => item.severity === 'error')) {
    return
  }
  if (result.applicability.status === 'not-applicable') {
    return
  }
  const checkTypes = entries.length > 0 && result.files.some(file => /\.d\.[cm]?ts$/u.test(file))
  const closure = consumerRuntimeClosure([pkg.manifest], packages.map(item => item.manifest), options.expectedWorkspaceLocators)
  const dependencies = { ...consumerOptionalPeers(closure, new Map(packages.map(item => [String(item.manifest.name), `file:${item.result.tarball}`]))), [String(pkg.manifest.name)]: `file:${result.tarball}` }
  const tooling = checkTypes ? await consumerTypeToolchain(result.directory, dependencies, closure) : undefined
  const manifest = {
    name: 'repoctl-package-consumer',
    private: true,
    ...(packageManager ? { packageManager } : {}),
    dependencies,
    ...(tooling ? { devDependencies: tooling.devDependencies } : {}),
  }
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, 'package.json'), JSON.stringify(manifest, null, 2))
  // Overrides use packed files, never workspace source directories. Keep this consumer
  // outside the source workspace so pnpm cannot discover its packages or configuration.
  await writeFile(path.join(directory, 'pnpm-workspace.yaml'), stringify({
    packages: [],
    overrides: Object.fromEntries([
      ...packages.map(item => [String(item.manifest.name), `file:${item.result.tarball}`]),
      ...packages.flatMap(item => dependencyReferences(item.manifest, item.result.directory).flatMap((reference) => {
        const target = consumerDependency(item, reference, options.expectedWorkspaceLocators)?.name ?? reference.name
        const local = packages.find(candidate => candidate.manifest.name === target)
        return local ? [[`${item.manifest.name}>${reference.alias}`, `file:${local.result.tarball}`]] : []
      })),
    ]),
  }))
  manifest.dependencies = await resolveConsumerPeerAliases(dependencies, async (specifier) => {
    const query = await execute(packageManager ? 'corepack' : 'pnpm', [...(packageManager ? ['pnpm'] : []), 'view', specifier, 'version', '--json', '--config.manage-package-manager-versions=false'], directory, timeout, options)
    result.commands.push(query)
    if (query.exitCode !== 0) {
      throw new Error(failureMessage(query))
    }
    return query.stdout
  })
  await writeFile(path.join(directory, 'package.json'), JSON.stringify(manifest, null, 2))
  const install = await execute(packageManager ? 'corepack' : 'pnpm', [...(packageManager ? ['pnpm'] : []), 'install', '--ignore-scripts', '--no-frozen-lockfile', '--config.manage-package-manager-versions=false'], directory, timeout, options)
  result.commands.push(install)
  if (install.exitCode !== 0) {
    result.diagnostics.push({ source: 'repoctl', code: 'CONSUMER_INSTALL', severity: 'error', message: failureMessage(install) })
    return
  }
  const installed = await realpath(path.join(directory, 'node_modules', String(pkg.manifest.name)))
  const relative = path.relative(await realpath(directory), installed)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Consumer resolved a package outside its isolated directory.')
  }
  const toolchain = tooling ? await installedConsumerTypeToolchain(directory, tooling) : undefined
  for (const [index, entry] of entries.entries()) {
    const specifier = `${pkg.manifest.name}${entry.subpath === '.' ? '' : entry.subpath.slice(1)}`
    if (entry.runtime) {
      const source = entry.asset ? consumerAssetSource(entry, specifier, installed) : entry.format === 'esm' ? `await import(${JSON.stringify(specifier)})` : `require(${JSON.stringify(specifier)})`
      const command = await execute(process.execPath, ['--input-type', entry.format === 'esm' ? 'module' : 'commonjs', '--eval', source], directory, timeout, options)
      result.commands.push(command)
      if (command.exitCode !== 0) {
        result.diagnostics.push({ source: 'node', code: entry.asset ? 'RUNTIME_ASSET' : 'RUNTIME_IMPORT', severity: 'error', entry: entry.subpath, file: entry.target, message: failureMessage(command) })
      }
      if (entry.asset && command.exitCode === 0) {
        const syntax = await execute(process.execPath, ['--check', path.resolve(installed, entry.target)], directory, timeout, options)
        result.commands.push(syntax)
        if (syntax.exitCode !== 0) {
          result.diagnostics.push({ source: 'node', code: 'RUNTIME_ASSET_SYNTAX', severity: 'error', entry: entry.subpath, file: entry.target, message: failureMessage(syntax) })
        }
      }
    }
    if (toolchain && entry.typecheck !== false) {
      const file = `consume-${index}.${entry.format === 'esm' ? 'mts' : 'cts'}`
      const importText = !entry.runtime ? `import type * as subject from ${JSON.stringify(specifier)}` : entry.format === 'esm' ? `import * as subject from ${JSON.stringify(specifier)}` : `import subject = require(${JSON.stringify(specifier)})`
      await writeFile(path.join(directory, file), `${importText};\ntype Consumer = typeof subject;\n`)
      const types = await execute(process.execPath, [toolchain.tsc, '--noEmit', '--strict', '--skipLibCheck', 'false', '--module', 'nodenext', '--target', 'es2022', '--typeRoots', toolchain.typeRoots, '--types', toolchain.nodeTypes, file], directory, timeout, options)
      result.commands.push(types)
      if (types.exitCode !== 0) {
        result.diagnostics.push({ source: 'repoctl', code: 'TYPESCRIPT_CONSUMER', severity: 'error', entry: entry.subpath, file: entry.target, message: failureMessage(types) })
      }
    }
  }
  const bins = typeof pkg.manifest.bin === 'string' ? [pkg.manifest.bin] : Object.values(pkg.manifest.bin ?? {})
  for (const bin of bins) {
    if (typeof bin === 'string' && /\.[cm]?js$/u.test(bin)) {
      const command = await execute(process.execPath, ['--check', path.join(installed, bin)], directory, timeout, options)
      result.commands.push(command)
      if (command.exitCode !== 0) {
        result.diagnostics.push({ source: 'node', code: 'BIN_SYNTAX', severity: 'error', file: bin, message: failureMessage(command) })
      }
    }
  }
}
