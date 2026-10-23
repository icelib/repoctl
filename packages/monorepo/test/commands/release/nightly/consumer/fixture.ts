import type { NightlyOptions } from '@icebreakers/monorepo'
import type { SpawnSyncOptions, SpawnSyncReturns } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { create } from 'tar'
import { afterEach, vi } from 'vitest'
import { snapshotMetadata } from '../../../../../src/commands/release/snapshot/identity'
import { reportFixture } from '../provider-fixture'

const roots: string[] = []
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))))

export function completed(stderr = '', status = 1): SpawnSyncReturns<string> {
  return { status, stdout: '', stderr, pid: 1, signal: null, output: [null, '', stderr] }
}

export function missingVersion(reference: string, code = 'ERR_PNPM_NO_MATCHING_VERSION') {
  return JSON.stringify({ name: 'pnpm', level: 'error', code, message: `No matching version found for ${reference} while fetching it from https://registry.npmjs.org/\n\nFailed to resolve ${reference}` })
}

export async function consumerFixture(settings: { provider?: 'npm' | 'pkg-pr-new', mutate?: (manifest: Record<string, unknown>) => void, escapeBin?: boolean, manifest?: Record<string, unknown>, files?: Record<string, string> } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'repoctl-nightly-consumer-test-'))
  roots.push(root)
  await writeFile(path.join(root, 'package.json'), '{"packageManager":"pnpm@12.13.0"}')
  const report = reportFixture(settings.provider ?? 'npm')
  report.confirmed = true
  report.outputDirectory = root
  const files = { 'index.js': 'export const value = 1', 'bin.js': '', ...settings.files }
  report.snapshot!.checks = report.packages.map(pkg => ({ name: pkg.name, files: ['package.json', ...Object.keys(files)] })) as NonNullable<NonNullable<typeof report.snapshot>['checks']>
  const manifests = new Map(report.packages.map(pkg => [pkg.name, { name: pkg.name, version: pkg.version, type: 'module', exports: './index.js', bin: 'bin.js', repoctlSnapshot: snapshotMetadata(report.snapshot!), ...settings.manifest }]))
  for (const [index, pkg] of report.snapshot!.packages.entries()) {
    const archive = path.join(root, `archive-${index}`)
    await mkdir(path.join(archive, 'package'), { recursive: true })
    await writeFile(path.join(archive, 'package/package.json'), JSON.stringify(manifests.get(pkg.name)))
    for (const [file, content] of Object.entries(files)) {
      const filename = path.join(archive, 'package', file)
      await mkdir(path.dirname(filename), { recursive: true })
      await writeFile(filename, content)
    }
    pkg.tarball = path.join(root, `archive-${index}.tgz`)
    await create({ gzip: true, file: pkg.tarball, cwd: archive }, ['package'])
    pkg.integrity = `sha512-${createHash('sha512').update(await readFile(pkg.tarball)).digest('base64')}`
  }
  let installed = ''
  let consumerManifest: Record<string, unknown> = {}
  const install = vi.fn<(args: readonly string[], options: SpawnSyncOptions) => SpawnSyncReturns<string> | undefined>()
  const spawn = vi.fn((_command: string, args: readonly string[], options: SpawnSyncOptions): SpawnSyncReturns<string> => {
    if (args.includes('--version')) {
      return { ...completed('', 0), stdout: '12.13.0\n' }
    }
    if (args.includes('install')) {
      installed = String(options.cwd)
      consumerManifest = JSON.parse(readFileSync(path.join(installed, 'package.json'), 'utf8'))
      const failure = install(args, options)
      if (failure) {
        return failure
      }
      for (const pkg of report.packages) {
        const directory = path.join(installed, 'node_modules', pkg.name)
        mkdirSync(directory, { recursive: true })
        const manifest = structuredClone(manifests.get(pkg.name)!)
        settings.mutate?.(manifest)
        writeFileSync(path.join(directory, 'package.json'), JSON.stringify(manifest))
        for (const [file, content] of Object.entries(files)) {
          const filename = path.join(directory, file)
          mkdirSync(path.dirname(filename), { recursive: true })
          writeFileSync(filename, content)
        }
        if (settings.escapeBin) {
          // Replace the ordinary bin fixture with an escaping link.
          rmSync(path.join(directory, 'bin.js'))
          symlinkSync(path.join(root, 'package.json'), path.join(directory, 'bin.js'))
        }
      }
    }
    return completed('', 0)
  })
  const sleep = vi.fn(async (_milliseconds: number) => {})
  const options: NightlyOptions = {
    cwd: root,
    spawn: spawn as unknown as NightlyOptions['spawn'] & {},
    sleep,
    config: { registry: { visibilityTimeoutMs: 10_000 } },
    env: { ...process.env, NPM_TOKEN: 'secret', NODE_PATH: root, NODE_OPTIONS: '--require=source-hook', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'secret' },
  }
  return { report, options, spawn, install, sleep, root, installed: () => installed, manifest: () => consumerManifest }
}
