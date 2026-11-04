import type { NightlyConsumerReport } from '../nightly/types'
import type { BootstrapOptions, BootstrapReport } from './types'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { consumerOptionalPeers } from '../../package-check/consumer/optional-peers'
import { consumerPackageApplicability } from '../../package-check/consumer/platform'
import { consumerRuntimeClosure } from '../../package-check/consumer/runtime-closure'
import { consumerTypeToolchain, installedConsumerTypeToolchain } from '../../package-check/consumer/typescript'
import { checkInstalledEntries } from '../nightly/consumer/entries'
import { consumerEnvironment } from '../nightly/consumer/environment'
import { consumerRunner } from '../nightly/consumer/run'
import { readBounded, record } from '../snapshot/prepared/github/client'
import { bootstrapVersion } from './registry'
import { bootstrapRegistry, validateBootstrapArchive } from './schema'

function assertInside(directory: string, filename: string) {
  const relative = path.relative(directory, filename)
  assert.ok(relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), 'Bootstrap consumer resolved a file outside its isolated package')
}

/** 公开 registry 的精确版本必须与原 tarball 一致，且签名、入口和声明都能独立消费。 */
export async function verifyBootstrapConsumer(report: BootstrapReport, options: BootstrapOptions) {
  assert.ok(report.confirmed && report.manifest && report.outputDirectory, 'Bootstrap consumer requires confirmed publication evidence')
  const manifest = report.manifest
  const result: NightlyConsumerReport = { status: 'failed', packages: [], commands: [] }
  let directory: string | undefined
  let failure: unknown
  try {
    const metadata = await bootstrapVersion(manifest, options)
    assert.ok(metadata, 'Bootstrap registry version disappeared before consumer verification')
    const url = new URL(String(record(metadata['dist'])['tarball']))
    assert.equal(url.origin, new URL(bootstrapRegistry).origin)
    assert.ok(!url.username && !url.password && !url.hash)
    const response = await (options.registryFetch ?? globalThis.fetch)(url, { redirect: 'error', signal: AbortSignal.timeout(60_000) })
    assert.ok(response.ok, `Bootstrap tarball download failed: HTTP ${response.status}`)
    const bytes = await readBounded(response, 128 * 1024 * 1024)
    const entries = await validateBootstrapArchive(manifest, bytes)
    result.applicability = consumerPackageApplicability([manifest.packedManifest])
    assert.equal(result.applicability[0]?.status, 'applicable', 'Bootstrap consumer requires a runner compatible with the selected package')
    directory = await realpath(await mkdtemp(path.join(tmpdir(), 'repoctl-bootstrap-consumer-')))
    const closure = consumerRuntimeClosure([manifest.packedManifest], [manifest.packedManifest])
    const dependencies = { ...consumerOptionalPeers(closure), [manifest.package.name]: manifest.package.version }
    const tooling = manifest.package.files.some(file => /\.d\.[cm]?ts$/u.test(file)) ? await consumerTypeToolchain(options.cwd, dependencies, closure) : undefined
    await Promise.all([
      writeFile(path.join(directory, 'package.json'), `${JSON.stringify({ name: 'repoctl-bootstrap-consumer', private: true, type: 'module', dependencies, ...(tooling ? { devDependencies: tooling.devDependencies } : {}) }, null, 2)}\n`),
      writeFile(path.join(directory, 'user.npmrc'), ''),
      writeFile(path.join(directory, 'global.npmrc'), ''),
    ])
    const env = consumerEnvironment(options.env ?? process.env, directory)
    env['npm_config_cache'] = path.join(directory, '.npm-cache')
    const run = consumerRunner(result, options, directory, env)
    await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--registry', bootstrapRegistry])
    const lock = record(JSON.parse(await readFile(path.join(directory, 'package-lock.json'), 'utf8')))
    const locked = record(record(lock['packages'])[`node_modules/${manifest.package.name}`])
    assert.equal(locked['version'], manifest.package.version)
    assert.equal(locked['integrity'], manifest.package.integrity, 'Consumer lockfile integrity differs')
    assert.equal(locked['resolved'], url.href, 'Consumer lockfile resolved a different registry tarball')
    const installed = await realpath(path.join(directory, 'node_modules', manifest.package.name))
    assertInside(directory, installed)
    for (const entry of entries.filter(entry => entry.type === 'File')) {
      const filename = await realpath(path.join(installed, entry.path.slice('package/'.length)))
      assertInside(installed, filename)
      assert.deepEqual(await readFile(filename), entry.data, `Installed bootstrap file differs: ${entry.path}`)
    }
    await run('npm', ['audit', 'signatures', '--registry', bootstrapRegistry])
    const toolchain = tooling ? await installedConsumerTypeToolchain(directory, tooling) : undefined
    await checkInstalledEntries(manifest.packedManifest, manifest.package.files, installed, directory, run, 0, toolchain)
    result.packages.push({ name: manifest.package.name, version: manifest.package.version })
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
    report.consumer = { ...result, status: result.status === 'verified' ? 'passed' : 'failed' }
    await mkdir(report.outputDirectory, { recursive: true })
    await writeFile(path.join(report.outputDirectory, 'consumer-report.json'), `${JSON.stringify(report.consumer, null, 2)}\n`)
  }
  if (failure) {
    throw failure
  }
}
