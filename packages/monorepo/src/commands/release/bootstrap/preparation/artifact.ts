import type { PackageCheckResult, PackedPackage } from '../../../package-check/types'
import type { BootstrapOptions, BootstrapPlan } from '../types'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { satisfies, valid, validRange } from 'semver'
import { analyzeTarball } from '../../../package-check/analyze'
import { consumeTarball } from '../../../package-check/consumer'
import { dependencyReferences } from '../../../package-check/dependencies'
import { consumerEntries } from '../../../package-check/entries'
import { packageBuildSelector } from '../../../package-check/workspace'
import { readSnapshotArchive } from '../../snapshot/archive'
import { isolatedPnpmOptions, snapshotCommand } from '../../snapshot/process'

interface PreparationContext {
  directory: string
  source: string
  env: NodeJS.ProcessEnv
}

async function assertRegistryDependencies(item: PackedPackage, names: Set<string>, context: PreparationContext, options: BootstrapOptions) {
  for (const reference of dependencyReferences(item.manifest, item.result.directory)) {
    if (reference.protocol !== 'registry') {
      throw new Error(`Bootstrap packed dependency ${reference.alias} still uses ${reference.protocol}: instead of a registry range.`)
    }
    if (!names.has(reference.name)) {
      continue
    }
    if (!validRange(reference.range)) {
      throw new Error(`Bootstrap internal dependency ${reference.name} must use a publishable semver range.`)
    }
    let versions: unknown
    try {
      versions = JSON.parse(snapshotCommand('pnpm', [...isolatedPnpmOptions, 'view', `${reference.name}@${reference.range}`, 'version', '--json', '--registry', 'https://registry.npmjs.org/'], { ...options, cwd: context.directory, env: context.env }))
    }
    catch {
      throw new Error(`Bootstrap internal dependency ${reference.name}@${reference.range} is unavailable from the public registry; publish it separately before bootstrapping this package.`)
    }
    if (!(Array.isArray(versions) ? versions : [versions]).some(version => typeof version === 'string' && valid(version) && satisfies(version, reference.range))) {
      throw new Error(`Bootstrap internal dependency ${reference.name}@${reference.range} has no public registry version; automatic publication expansion is not allowed.`)
    }
  }
}

export async function bootstrapArtifact(context: PreparationContext, plan: BootstrapPlan, options: BootstrapOptions, names: Set<string>) {
  const execution = { ...options, env: context.env }
  const directory = path.join(context.source, plan.package.directory)
  const manifestPath = path.join(directory, 'package.json')
  const original = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>
  await writeFile(manifestPath, `${JSON.stringify({ ...original, version: plan.package.version, publishConfig: { ...(original['publishConfig'] as Record<string, unknown> | undefined), access: 'public', registry: plan.registry, tag: plan.tag } }, null, 2)}\n`)
  const result: PackageCheckResult = { name: plan.package.name, directory, role: 'selected', status: 'passed', files: [], diagnostics: [], commands: [] }
  function command(args: string[], cwd: string) {
    const stdout = snapshotCommand('pnpm', [...isolatedPnpmOptions, ...args], { ...execution, cwd })
    result.commands.push({ cwd, executable: 'pnpm', args: [...isolatedPnpmOptions, ...args], exitCode: 0, output: stdout, stdout, stderr: '' })
  }
  const selectors = plan.buildDirectories.flatMap(relative => ['--filter', packageBuildSelector(context.source, path.join(context.source, relative))])
  command([...selectors, '--recursive', '--fail-if-no-match', '--if-present', 'run', 'build'], context.source)
  const scripts = original['scripts'] as Record<string, unknown> | undefined
  for (const script of ['lint', 'typecheck', 'test', scripts?.['test:types'] ? 'test:types' : 'tsd']) {
    if (typeof scripts?.[script] === 'string') {
      command(['--filter', packageBuildSelector(context.source, directory), '--fail-if-no-match', 'run', script], context.source)
    }
  }
  const portable = path.resolve(options.outputDirectory ?? path.join(context.directory, 'prepared'))
  await mkdir(path.join(portable, 'tarballs'), { recursive: true })
  const tarball = path.join(portable, 'tarballs', 'package.tgz')
  command(['pack', '--out', tarball], directory)
  result.tarball = tarball
  const bytes = Uint8Array.from(await readFile(tarball))
  const archive = await readSnapshotArchive(bytes)
  const packedJson = archive.find(entry => entry.path === 'package/package.json' && entry.type === 'File')
  if (!packedJson) {
    throw new Error('Bootstrap tarball must contain one regular package/package.json.')
  }
  const packedManifest = JSON.parse(Buffer.from(packedJson.data).toString('utf8')) as Record<string, unknown>
  const config = packedManifest['publishConfig'] as Record<string, unknown> | undefined
  if (packedManifest['name'] !== plan.package.name || packedManifest['version'] !== plan.package.version || packedManifest['private'] === true
    || config?.['registry'] !== plan.registry || config?.['tag'] !== plan.tag || config?.['access'] !== 'public' || config?.['directory'] !== undefined) {
    throw new Error('Bootstrap pack lifecycle changed the frozen package identity or publication target.')
  }
  const item: PackedPackage = { result, manifest: {}, bytes }
  await analyzeTarball(item)
  await assertRegistryDependencies(item, names, context, options)
  const entries = consumerEntries(item.manifest, result.files)
  await consumeTarball(item, [item], [result], entries, path.join(context.directory, 'consumer'), 600_000, { env: context.env, packageManager: `pnpm@${plan.pnpmVersion}` })
  if (result.diagnostics.some(diagnostic => diagnostic.severity === 'error')) {
    result.status = 'failed'
    throw new Error(`Bootstrap package validation failed: ${result.diagnostics.filter(diagnostic => diagnostic.severity === 'error').map(diagnostic => `${diagnostic.code}: ${diagnostic.message}`).join('; ')}`)
  }
  return { item, entries, portable, integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}` }
}
