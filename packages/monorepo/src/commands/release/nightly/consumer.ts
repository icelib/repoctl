import type { PackedManifest } from '../../package-check/types'
import type { NightlyConsumerReport, NightlyOptions, NightlyReport } from './types'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { matchesSnapshotMetadata } from '../snapshot/identity'
import { checkInstalledEntries } from './consumer/entries'
import { consumerEnvironment, consumerPnpmOptions } from './consumer/environment'
import { installNightlyConsumer } from './consumer/install'
import { consumerRunner } from './consumer/run'

/** Exercise the real published channel with no workspace links or dependency overrides. */
export async function verifyNightlyConsumer(report: NightlyReport, options: NightlyOptions): Promise<void> {
  if (!report.confirmed || !report.snapshot || !report.outputDirectory || !report.packages.length) {
    throw new Error('Nightly consumer requires a confirmed publication and retained artifacts.')
  }
  const result: NightlyConsumerReport = { status: 'failed', packages: [], commands: [] }
  report.consumer = result
  let directory: string | undefined
  let failure: unknown
  try {
    const source = JSON.parse(await readFile(path.join(options.cwd, 'package.json'), 'utf8')) as { packageManager?: string }
    const pin = /^pnpm@(\d+\.\d+\.\d+)(?:\+sha\d+\.[a-f0-9]+)?$/u.exec(source.packageManager ?? '')
    if (!pin) {
      throw new Error('Nightly consumer requires an exact pnpm packageManager pin.')
    }
    await mkdir(report.outputDirectory, { recursive: true })
    directory = await realpath(await mkdtemp(path.join(report.outputDirectory, 'consumer-')))
    const nodeTypes = JSON.parse(await readFile(createRequire(import.meta.url).resolve('@types/node/package.json'), 'utf8')) as { version: string }
    await Promise.all([
      writeFile(path.join(directory, 'package.json'), `${JSON.stringify({
        name: 'repoctl-nightly-consumer',
        private: true,
        type: 'module',
        packageManager: source.packageManager,
        dependencies: Object.fromEntries(report.packages.map(pkg => [pkg.name, report.provider === 'npm' ? 'snapshot-nightly' : pkg.locator])),
        ...(!report.packages.some(pkg => pkg.name === '@types/node') ? { devDependencies: { '@types/node': nodeTypes.version } } : {}),
      }, null, 2)}\n`),
      writeFile(path.join(directory, 'pnpm-workspace.yaml'), 'packages: []\n'),
      writeFile(path.join(directory, 'user.npmrc'), ''),
      writeFile(path.join(directory, 'global.npmrc'), ''),
    ])
    const run = consumerRunner(result, options, directory, consumerEnvironment(options.env ?? process.env, directory))
    if (await run('pnpm', [...consumerPnpmOptions, '--version']) !== pin[1]) {
      throw new Error(`Nightly consumer requires pnpm ${pin[1]}.`)
    }
    await installNightlyConsumer(report, options, directory, run)
    const validated = []
    for (const pkg of report.packages) {
      const installed = await realpath(path.join(directory, 'node_modules', pkg.name))
      const relative = path.relative(directory, installed)
      if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error(`Nightly consumer resolved ${pkg.name} outside its isolated directory.`)
      }
      const manifest = JSON.parse(await readFile(path.join(installed, 'package.json'), 'utf8')) as PackedManifest & { repoctlSnapshot?: unknown }
      if (manifest.name !== pkg.name || manifest.version !== pkg.version || !matchesSnapshotMetadata(manifest.repoctlSnapshot, report.snapshot)) {
        throw new Error(`Nightly consumer installed an unexpected version or identity for ${pkg.name}.`)
      }
      const files = report.snapshot.checks?.find(check => check.name === pkg.name)?.files
      if (!files) {
        throw new Error(`Nightly consumer has no checked artifact manifest for ${pkg.name}.`)
      }
      validated.push({ manifest, files, installed, pkg })
    }
    for (const [index, { manifest, files, installed, pkg }] of validated.entries()) {
      await checkInstalledEntries(manifest, files, installed, directory, run, index)
      result.packages.push({ name: pkg.name, version: pkg.version })
    }
    result.status = 'verified'
  }
  catch (error) {
    failure = error
    result.error = error instanceof Error ? error.message : String(error)
  }
  finally {
    if (directory) {
      try {
        await rm(directory, { recursive: true, force: true })
      }
      catch (error) {
        result.status = 'failed'
        result.error = `${result.error ?? ''} Consumer cleanup failed: ${error instanceof Error ? error.message : String(error)}`.trim()
        failure = error
      }
    }
    await writeFile(path.join(report.outputDirectory, 'consumer-report.json'), `${JSON.stringify(result, null, 2)}\n`)
  }
  if (failure) {
    throw failure
  }
}
