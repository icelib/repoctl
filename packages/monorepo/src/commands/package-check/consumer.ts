import type { ConsumerEntry, PackageCheckResult, PackedPackage } from './types'
import { mkdir, realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { satisfies, validRange } from 'semver'
import { stringify } from 'yaml'
import { dependencyReferences } from './dependencies'
import { execute, failureMessage } from './process'

function checkDependencyRanges(pkg: PackedPackage, packages: PackedPackage[], results: PackageCheckResult[]) {
  for (const { name, alias, range, field, protocol } of dependencyReferences(pkg.manifest, pkg.result.directory)) {
    const file = `package.json:${field}.${alias}`
    const local = packages.find(candidate => candidate.manifest.name === name)
    if (protocol !== 'registry') {
      pkg.result.diagnostics.push({ source: 'repoctl', code: 'UNCONVERTED_LOCAL_DEPENDENCY', severity: 'error', file, message: `Packed dependency ${alias} still uses ${protocol}: instead of a publishable registry version.` })
    }
    if (!local && results.some(candidate => candidate.name === name)) {
      pkg.result.diagnostics.push({ source: 'repoctl', code: 'WORKSPACE_DEPENDENCY_UNAVAILABLE', severity: 'error', file, message: `Workspace dependency ${name} has no checked tarball (private, skipped, or failed packing).` })
    }
    if (local && (!validRange(range) || !satisfies(String(local.manifest.version), range))) {
      pkg.result.diagnostics.push({ source: 'repoctl', code: 'WORKSPACE_DEPENDENCY_RANGE', severity: 'error', file, message: `Packed dependency ${name}@${range} does not accept workspace tarball version ${local.manifest.version}.` })
    }
  }
}

export async function consumeTarball(pkg: PackedPackage, packages: PackedPackage[], results: PackageCheckResult[], entries: ConsumerEntry[], directory: string, timeout: number) {
  const { result } = pkg
  checkDependencyRanges(pkg, packages, results)
  if (result.diagnostics.some(item => item.severity === 'error')) {
    return
  }
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({
    name: 'repoctl-package-consumer',
    private: true,
    dependencies: { [String(pkg.manifest.name)]: `file:${result.tarball}` },
  }, null, 2))
  // Overrides use packed files, never workspace source directories. Keep this consumer
  // outside the source workspace so pnpm cannot discover its packages or configuration.
  await writeFile(path.join(directory, 'pnpm-workspace.yaml'), stringify({
    packages: [],
    overrides: Object.fromEntries([
      ...packages.map(item => [String(item.manifest.name), `file:${item.result.tarball}`]),
      ...packages.flatMap(item => dependencyReferences(item.manifest, item.result.directory).flatMap((reference) => {
        const local = packages.find(candidate => candidate.manifest.name === reference.name)
        return local ? [[`${item.manifest.name}>${reference.alias}`, `file:${local.result.tarball}`]] : []
      })),
    ]),
  }))
  const install = await execute('pnpm', ['install', '--ignore-scripts', '--no-frozen-lockfile', '--config.manage-package-manager-versions=false'], directory, timeout)
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
  const require = createRequire(import.meta.resolve('@arethetypeswrong/core/package.json'))
  const tsc = require.resolve('typescript/bin/tsc')
  for (const [index, entry] of entries.entries()) {
    const specifier = `${pkg.manifest.name}${entry.subpath === '.' ? '' : entry.subpath.slice(1)}`
    if (entry.runtime) {
      const source = entry.format === 'esm' ? `await import(${JSON.stringify(specifier)})` : `require(${JSON.stringify(specifier)})`
      const command = await execute(process.execPath, ['--input-type', entry.format === 'esm' ? 'module' : 'commonjs', '--eval', source], directory, timeout)
      result.commands.push(command)
      if (command.exitCode !== 0) {
        result.diagnostics.push({ source: 'node', code: 'RUNTIME_IMPORT', severity: 'error', entry: entry.subpath, file: entry.target, message: failureMessage(command) })
      }
    }
    if (result.files.some(file => /\.d\.[cm]?ts$/u.test(file))) {
      const file = `consume-${index}.${entry.format === 'esm' ? 'mts' : 'cts'}`
      const importText = !entry.runtime ? `import type * as subject from ${JSON.stringify(specifier)}` : entry.format === 'esm' ? `import * as subject from ${JSON.stringify(specifier)}` : `import subject = require(${JSON.stringify(specifier)})`
      await writeFile(path.join(directory, file), `${importText};\ntype Consumer = typeof subject;\n`)
      const types = await execute(process.execPath, [tsc, '--noEmit', '--strict', '--module', 'nodenext', '--target', 'es2022', file], directory, timeout)
      result.commands.push(types)
      if (types.exitCode !== 0) {
        result.diagnostics.push({ source: 'repoctl', code: 'TYPESCRIPT_CONSUMER', severity: 'error', entry: entry.subpath, file: entry.target, message: failureMessage(types) })
      }
    }
  }
  const bins = typeof pkg.manifest.bin === 'string' ? [pkg.manifest.bin] : Object.values(pkg.manifest.bin ?? {})
  for (const bin of bins) {
    if (typeof bin === 'string' && /\.[cm]?js$/u.test(bin)) {
      const command = await execute(process.execPath, ['--check', path.join(installed, bin)], directory, timeout)
      result.commands.push(command)
      if (command.exitCode !== 0) {
        result.diagnostics.push({ source: 'node', code: 'BIN_SYNTAX', severity: 'error', file: bin, message: failureMessage(command) })
      }
    }
  }
}
