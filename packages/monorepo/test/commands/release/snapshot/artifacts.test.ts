import type { SnapshotOptions } from '@icebreakers/monorepo'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createPackageFromTarballData } from '@arethetypeswrong/core'
import { releaseSnapshot } from '@icebreakers/monorepo'
import { expect, it } from 'vitest'
import { fixture, snapshot } from './fixture'

it('builds and validates two exact snapshot tarballs, publishes via the adapter and installs a clean consumer', async () => {
  const h = await fixture()
  const before = await snapshot(h.cwd)
  const attempts: string[][] = []
  const interruptedSpawn = ((command, args, settings) => {
    if (command === 'pnpm' && args?.[0] === 'publish') {
      attempts.push(args as string[])
      if (attempts.length === 1 || attempts.length === 3) {
        const stderr = attempts.length === 1 ? 'E503 temporary registry failure' : 'E403 rejected second upload'
        return { status: 1, signal: null, stdout: '', stderr, pid: 1, output: [null, '', stderr] }
      }
    }
    return h.options.spawn!(command, args ?? [], settings as Parameters<NonNullable<SnapshotOptions['spawn']>>[2])
  }) as NonNullable<SnapshotOptions['spawn']>
  const partial = await releaseSnapshot({ ...h.options, publish: true, spawn: interruptedSpawn })
  expect(partial.status, partial.error).toBe('failed')
  expect(h.uploads).toHaveLength(1)
  expect(attempts).toHaveLength(3)
  expect(attempts.every(args => !args.includes('--filter'))).toBe(true)
  expect(await snapshot(h.cwd)).toEqual(before)
  const report = await releaseSnapshot({ ...h.options, publish: true })
  expect(report.status, report.error).toBe('published')
  expect(report.checks?.every(check => check.status === 'passed')).toBe(true)
  expect(h.uploads).toHaveLength(2)
  expect(h.run('npm', ['view', 'snapshot-a', 'dist-tags.latest', '--registry', h.options.registry!])).toBe('1.0.0')
  expect(h.uploads.every(args => args.includes('snapshot-pr-12') && args.includes('--ignore-scripts') && !args.includes('latest'))).toBe(true)
  const a = report.packages.find(pkg => pkg.name === 'snapshot-a')!
  const b = report.packages.find(pkg => pkg.name === 'snapshot-b')!
  const packed = createPackageFromTarballData(Uint8Array.from(await readFile(b.tarball!)))
  const manifest = JSON.parse(packed.readFile('/node_modules/snapshot-b/package.json'))
  expect(manifest.dependencies['snapshot-a']).toBe(a.version)
  const consumer = path.join(h.root, 'clean-consumer')
  await mkdir(consumer)
  await writeFile(path.join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies: { 'snapshot-a': a.version, 'snapshot-b': b.version } }))
  h.run('pnpm', ['install', '--ignore-scripts', '--registry', h.options.registry!], consumer)
  expect(h.run('node', ['--input-type=module', '--eval', 'import {value} from "snapshot-b"; console.log(value)'], consumer)).toBe('42')
  expect(await snapshot(h.cwd)).toEqual(before)
  // Publishing the identical build reconciles immutable registry evidence without new uploads.
  const repeated = await releaseSnapshot({ ...h.options, publish: true })
  expect(repeated.status, repeated.error).toBe('published')
  expect(h.uploads).toHaveLength(2)
  expect(await snapshot(h.cwd)).toEqual(before)
}, 240_000)

it('keeps source and Git refs unchanged on a build failure, with no upload', async () => {
  const h = await fixture()
  await h.write('build.cjs', 'process.exit(7)')
  h.run('git', ['add', '.'])
  h.run('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'broken build'])
  const commit = h.run('git', ['rev-parse', 'HEAD'])
  const before = await snapshot(h.cwd)
  const report = await releaseSnapshot({ ...h.options, identity: { kind: 'nightly', commit, buildId: 'failed-nightly' } })
  expect(report.status).toBe('failed')
  expect(report.error).toContain('build')
  expect(h.uploads).toEqual([])
  expect(await snapshot(h.cwd)).toEqual(before)
}, 120_000)

it('bounds nightly tarball filenames while retaining complete versions and snapshot identity', async () => {
  const h = await fixture()
  const identity = { kind: 'nightly' as const, commit: h.options.identity.commit, buildId: 'nightly-portable-artifacts' }
  const report = await releaseSnapshot({ ...h.options, identity })
  expect(report.status, report.error).toBe('prepared')
  expect(new Set(report.packages.map(pkg => pkg.tarball)).size).toBe(2)
  for (const pkg of report.packages) {
    expect(path.basename(pkg.tarball!).length).toBeLessThanOrEqual(32)
    const packed = createPackageFromTarballData(Uint8Array.from(await readFile(pkg.tarball!)))
    const manifest = JSON.parse(packed.readFile(`/node_modules/${pkg.name}/package.json`))
    expect(manifest.version).toBe(pkg.version)
    expect(manifest.version).toContain(identity.commit)
    expect(manifest.repoctlSnapshot).toMatchObject({ commit: identity.commit, identityKey: report.identityKey })
  }
  expect(h.uploads).toEqual([])
}, 120_000)

it('rejects a packed commit changed by build scripts even when the identity key is retained', async () => {
  const h = await fixture()
  const build = await readFile(path.join(h.cwd, 'build.cjs'), 'utf8')
  await h.write('build.cjs', `${build}; const file = 'packages/b/package.json'; const manifest = JSON.parse(fs.readFileSync(file, 'utf8')); manifest.repoctlSnapshot.commit = '${'b'.repeat(40)}'; fs.writeFileSync(file, JSON.stringify(manifest))`)
  h.run('git', ['add', '.'])
  h.run('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'build alters metadata'])
  const commit = h.run('git', ['rev-parse', 'HEAD'])
  await writeFile(h.env.GITHUB_EVENT_PATH, JSON.stringify({ ...h.event, pull_request: { ...h.event.pull_request, head: { ...h.event.pull_request.head, sha: commit } } }))
  const before = await snapshot(h.cwd)
  const report = await releaseSnapshot({
    ...h.options,
    publish: true,
    env: { ...h.options.env, GITHUB_SHA: commit },
    identity: { ...h.options.identity, commit },
  })
  expect(report.status).toBe('failed')
  expect(report.error).toContain('Packed snapshot identity')
  expect(h.uploads).toEqual([])
  expect(await snapshot(h.cwd)).toEqual(before)
}, 120_000)

it('does not discover an unrelated Git repository above the artifact directory', async () => {
  const h = await fixture()
  h.run('git', ['init', '-q'], h.root)
  const build = await readFile(path.join(h.cwd, 'build.cjs'), 'utf8')
  await h.write('build.cjs', `${build}; if (require('node:child_process').spawnSync('git', ['rev-parse', '--git-dir']).status === 0) process.exit(19)`)
  h.run('git', ['add', '.'])
  h.run('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'detect parent git'])
  const commit = h.run('git', ['rev-parse', 'HEAD'])
  const before = await snapshot(h.cwd)
  const report = await releaseSnapshot({
    ...h.options,
    publish: true,
    env: { ...h.options.env, GITHUB_SHA: commit, GITHUB_EVENT_NAME: 'schedule' },
    identity: { kind: 'nightly', commit, buildId: 'nested-output' },
  })
  expect(report.status, report.error).toBe('published')
  expect(await snapshot(h.cwd)).toEqual(before)
}, 120_000)
