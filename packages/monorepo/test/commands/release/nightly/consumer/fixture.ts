import type { NightlyOptions } from '@icebreakers/monorepo'
import type { SpawnSyncOptions, SpawnSyncReturns } from 'node:child_process'
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
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

export async function consumerFixture(settings: { provider?: 'npm' | 'pkg-pr-new', mutate?: (manifest: Record<string, unknown>) => void, escapeBin?: boolean } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'repoctl-nightly-consumer-test-'))
  roots.push(root)
  await writeFile(path.join(root, 'package.json'), '{"packageManager":"pnpm@12.13.0"}')
  const report = reportFixture(settings.provider ?? 'npm')
  report.confirmed = true
  report.outputDirectory = root
  report.snapshot!.checks = report.packages.map(pkg => ({ name: pkg.name, files: ['package.json', 'index.js', 'bin.js'] })) as NonNullable<NonNullable<typeof report.snapshot>['checks']>
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
        const manifest = { name: pkg.name, version: pkg.version, type: 'module', exports: './index.js', bin: 'bin.js', repoctlSnapshot: snapshotMetadata(report.snapshot!) }
        settings.mutate?.(manifest)
        writeFileSync(path.join(directory, 'package.json'), JSON.stringify(manifest))
        writeFileSync(path.join(directory, 'index.js'), 'export const value = 1')
        if (settings.escapeBin) {
          symlinkSync(path.join(root, 'package.json'), path.join(directory, 'bin.js'))
        }
        else {
          writeFileSync(path.join(directory, 'bin.js'), '')
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
