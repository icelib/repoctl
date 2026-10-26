import type { PreparedSnapshotConsumerOptions, PreparedSnapshotConsumerReport } from './types'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { consumerOptionalPeers } from '../../../../package-check/consumer/optional-peers'
import { resolveConsumerPeerAliases } from '../../../../package-check/consumer/peer-aliases'
import { consumerRuntimeClosure } from '../../../../package-check/consumer/runtime-closure'
import { consumerTypeToolchain, installedConsumerTypeToolchain } from '../../../../package-check/consumer/typescript'
import { checkInstalledEntries } from '../../../nightly/consumer/entries'
import { consumerEnvironment, consumerPnpmOptions } from '../../../nightly/consumer/environment'
import { consumerRunner } from '../../../nightly/consumer/run'
import { validateSnapshotBuildPlan } from '../schema'
import { publishedSnapshotManifests } from './artifacts'
import { installPreparedSnapshotConsumer } from './install'
import { installedSnapshotPackages } from './installed'
import { snapshotConsumerBudget } from './retry'

export type { PreparedSnapshotConsumerOptions, PreparedSnapshotConsumerReport } from './types'

/** Execute candidate packages only in a separate consumer job with a credential-free child environment. */
export async function verifyPreparedSnapshotConsumer(options: PreparedSnapshotConsumerOptions): Promise<PreparedSnapshotConsumerReport> {
  const report = options.report
  const manifest = report.manifest
  validateSnapshotBuildPlan(manifest.plan)
  if (report.status !== 'published' || report.packages.length !== manifest.packages.length
    || manifest.packages.some(pkg => !report.packages.some(item => item.published && item.name === pkg.name && item.version === pkg.version && item.integrity === pkg.integrity))) {
    throw new Error('Snapshot consumer requires a fully confirmed publication report.')
  }
  const result: PreparedSnapshotConsumerReport = { schemaVersion: 1, status: 'failed', packages: [], commands: [] }
  await mkdir(options.outputDirectory, { recursive: true })
  let directory: string | undefined
  try {
    const budget = snapshotConsumerBudget(options)
    const manifests = await publishedSnapshotManifests(manifest, options, budget)
    directory = await realpath(await mkdtemp(path.join(path.resolve(options.outputDirectory), 'snapshot-consumer-')))
    const clean = consumerEnvironment(options.env ?? process.env, directory)
    const run = consumerRunner(result, { ...options, cwd: directory }, directory, clean)
    const closure = consumerRuntimeClosure(manifests, manifests)
    const exact = Object.fromEntries(manifest.packages.map(pkg => [pkg.name, pkg.version]))
    const dependencies = await resolveConsumerPeerAliases({ ...consumerOptionalPeers(closure, new Map(Object.entries(exact).map(([name, version]) => [name, `npm:${name}@${version}`]))), ...exact }, specifier => run('pnpm', [...consumerPnpmOptions, 'view', specifier, 'version', '--json']))
    const checkTypes = manifest.checks.packages.some(check => check.files.some(file => /\.d\.[cm]?ts$/u.test(file)))
    const toolchain = checkTypes ? await consumerTypeToolchain(directory, dependencies, closure) : undefined
    await Promise.all([
      writeFile(path.join(directory, 'package.json'), `${JSON.stringify({ name: 'repoctl-snapshot-consumer', private: true, type: 'module', packageManager: manifest.plan.packageManager, dependencies, ...(toolchain ? { devDependencies: toolchain.devDependencies } : {}) }, null, 2)}\n`),
      writeFile(path.join(directory, 'pnpm-workspace.yaml'), `${JSON.stringify({ packages: [], minimumReleaseAgeExclude: manifest.packages.map(pkg => `${pkg.name}@${pkg.version}`) }, null, 2)}\n`),
      writeFile(path.join(directory, 'user.npmrc'), ''),
      writeFile(path.join(directory, 'global.npmrc'), ''),
    ])
    const expectedPnpm = /^pnpm@([^+]+)/u.exec(manifest.plan.packageManager)![1]
    if (await run('pnpm', [...consumerPnpmOptions, '--version']) !== expectedPnpm) {
      throw new Error(`Snapshot consumer requires pnpm ${expectedPnpm}.`)
    }
    await installPreparedSnapshotConsumer(manifest, directory, run, budget)
    const installedPackages = await installedSnapshotPackages(manifest, directory)
    const compiler = toolchain ? await installedConsumerTypeToolchain(directory, toolchain) : undefined
    for (const [index, pkg] of manifest.packages.entries()) {
      const { packed, installed } = installedPackages[index]!
      await checkInstalledEntries(packed, manifest.checks.packages[index]!.files, installed, directory, run, index, compiler)
      result.packages.push({ name: pkg.name, version: pkg.version })
    }
    result.status = 'verified'
  }
  catch (error) {
    result.error = error instanceof Error ? error.message : String(error)
  }
  finally {
    if (directory) {
      try {
        await rm(directory, { recursive: true, force: true })
      }
      catch (error) {
        result.status = 'failed'
        result.error = `Snapshot consumer cleanup failed: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }
  await writeFile(path.join(options.outputDirectory, 'consumer-report.json'), `${JSON.stringify(result, null, 2)}\n`)
  return result
}
