import type { BootstrapOptions, BootstrapReport } from './types'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import crossSpawn from 'cross-spawn'
import { consumerEnvironment } from '../nightly/consumer/environment'
import { auditReleaseOidc } from '../oidc'
import { publishWithRetry } from '../publish'
import { isolatedPnpmOptions, snapshotCommand } from '../snapshot/process'
import { bootstrapBundle } from './evidence'
import { emptyBootstrapOutput } from './output'
import { assertBootstrapTags, bootstrapTags, bootstrapVersion, confirmBootstrapRegistry } from './registry'

export async function writeBootstrapReport(report: BootstrapReport) {
  await writeFile(path.join(report.outputDirectory!, 'bootstrap-report.json'), `${JSON.stringify(report, null, 2)}\n`)
}

/** 发布端只处理核验后的字节，不 checkout 或执行候选工作区代码。 */
export async function publishBootstrap(options: BootstrapOptions): Promise<BootstrapReport> {
  assert.ok(!options.dryRun && !options.verifyRunId, 'Bootstrap upload cannot be combined with dry-run or verification recovery')
  assert.ok(options.outputDirectory, 'Bootstrap publisher requires an evidence directory')
  const bundle = await bootstrapBundle(options, 'prepared')
  const { manifest } = bundle
  const directory = path.resolve(options.outputDirectory)
  await emptyBootstrapOutput(directory)
  await mkdir(path.join(directory, 'tarballs'), { recursive: true })
  const report: BootstrapReport = { schemaVersion: 1, status: 'prepared', plan: manifest, manifest, outputDirectory: directory, accepted: false, confirmed: false }
  let toolchain: string | undefined
  const clean = consumerEnvironment(bundle.context.env, directory)
  const tooling = consumerEnvironment(bundle.context.env, directory)
  for (const [key, value] of Object.entries(bundle.context.env)) {
    if (/^(?:GITHUB_|ACTIONS_ID_TOKEN_REQUEST_|RUNNER_)/u.test(key) && value !== undefined) {
      clean[key] = value
    }
  }
  delete clean['GITHUB_TOKEN']
  const publication = { ...options, cwd: directory, env: clean, spawn: options.spawn ?? crossSpawn.sync, quiet: options.quiet ?? false }
  await Promise.all([
    writeFile(path.join(directory, 'bootstrap-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' }),
    writeFile(path.join(directory, manifest.package.tarball), bundle.tarball, { flag: 'wx' }),
    writeFile(path.join(directory, 'package.json'), '{"name":"repoctl-bootstrap-publisher","private":true}\n'),
    writeFile(path.join(directory, 'pnpm-workspace.yaml'), 'packages: []\n'),
    writeFile(path.join(directory, 'user.npmrc'), ''),
    writeFile(path.join(directory, 'global.npmrc'), ''),
  ])
  try {
    assert.equal(await bootstrapVersion(manifest, options), undefined, 'Bootstrap version already exists; use verification recovery or select a new explicit prerelease')
    report.baselineTags = await bootstrapTags(manifest.package.name, options)
    await writeBootstrapReport(report)
    toolchain = await mkdtemp(path.join(tmpdir(), 'repoctl-bootstrap-pnpm-'))
    snapshotCommand('npm', ['install', '--prefix', toolchain, '--ignore-scripts', '--no-package-lock', '--no-audit', '--no-fund', `pnpm@${manifest.pnpmVersion}`, '--registry', manifest.registry], { ...options, cwd: directory, env: tooling })
    clean['PATH'] = `${path.join(toolchain, 'node_modules', '.bin')}${path.delimiter}${clean['PATH'] ?? ''}`
    const audit = await auditReleaseOidc({ packages: [{ name: manifest.package.name, version: manifest.package.version, registry: manifest.registry }], env: clean, ...(options.fetch ? { fetch: options.fetch } : {}) })
    await writeFile(path.join(directory, 'oidc-audit.json'), `${JSON.stringify(audit, null, 2)}\n`)
    assert.ok(audit.ok, 'Bootstrap OIDC exchange failed; check the matching release.yml Trusted Publisher and its initial validation deadline')
    assert.equal(audit.identity['repository_id'], String(manifest.source.repositoryId))
    assert.equal(audit.identity['event_name'], 'workflow_dispatch')
    await publishWithRetry([...isolatedPnpmOptions, '--config.ignore-pnpmfile=true', 'publish', path.join(directory, manifest.package.tarball), '--ignore-scripts', '--no-git-checks', '--access', 'public', '--provenance', '--tag', manifest.tag, '--registry', manifest.registry], {
      ...publication,
      deferConfirmation: true,
      beforeAttempt: async () => { await assertBootstrapTags(manifest, report.baselineTags!, options) },
    }, [{ name: manifest.package.name, version: manifest.package.version }], false, {
      accepted: [],
      save: async (accepted) => {
        report.accepted ||= accepted.some(pkg => pkg.name === manifest.package.name && pkg.version === manifest.package.version)
        await writeBootstrapReport(report)
      },
    })
    report.accepted = true
    await writeBootstrapReport(report)
    await confirmBootstrapRegistry(report, options)
    report.status = 'published'
  }
  catch (error) {
    report.status = 'failed'
    report.error = error instanceof Error ? error.message : String(error)
  }
  finally {
    if (toolchain) {
      try {
        await rm(toolchain, { recursive: true, force: true })
      }
      catch (error) {
        report.status = 'failed'
        report.error = `${report.error ?? ''} Publisher toolchain cleanup failed: ${error instanceof Error ? error.message : String(error)}`.trim()
      }
    }
  }
  await writeBootstrapReport(report)
  return report
}
