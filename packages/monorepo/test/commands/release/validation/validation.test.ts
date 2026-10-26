import type { ReleasePreparationPolicy } from '@icebreakers/monorepo'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { readReleasePreparationPolicy, validateReleasePreparation } from '@icebreakers/monorepo'
import crossSpawn from 'cross-spawn'
import { afterEach, describe, expect, it } from 'vitest'
import { snapshot } from '../plan/fixture'
import { fixture } from './fixture'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(cwd => rm(cwd, { recursive: true, force: true })))
})

async function prepared(options: Parameters<typeof fixture>[0] = {}) {
  const data = await fixture(options)
  directories.push(data.cwd)
  const head = data.prepare()
  return { ...data, head }
}

describe('frozen release preparation validation', () => {
  it('accepts native fixed groups, indirect releases and nested workspaces without executing hooks or modifying checkout state', async () => {
    const data = await prepared({ root: true })
    await data.write('untracked-local.txt', 'keep local work')
    await data.write('repoctl.config.mjs', 'throw new Error("candidate configuration was executed")')
    const before = await snapshot(data.cwd)
    const report = await validateReleasePreparation({ ...data, policy: { branch: 'main' } })
    expect(report.errors).toEqual([])
    expect(report.status).toBe('valid')
    expect(report.packages).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'a', newVersion: '2.0.0', status: 'valid' }),
      expect.objectContaining({ name: 'b', newVersion: '2.0.0', status: 'valid' }),
      expect.objectContaining({ name: 'consumer', directory: 'packages/nested/consumer', currentVersion: '1.0.0', newVersion: '1.0.1', status: 'valid' }),
      expect.objectContaining({ name: 'root-pkg', private: true, status: 'valid' }),
    ]))
    const ledger = await readFile(path.join(data.cwd, '.changeset/ledger.yaml'), 'utf8')
    expect(ledger).not.toMatch(/^b@/m)
    expect(ledger).not.toContain('consumer@')
    expect(await snapshot(data.cwd)).toEqual(before)
    expect(before).not.toHaveProperty('HOOK_RAN')
  }, 60000)

  it('accepts native dependency changelog entries without a version increment or independent ledger entry', async () => {
    const data = await prepared({ dependencyRange: 'workspace:^1.0.0', unpublishedConsumer: true })
    const report = await validateReleasePreparation({ ...data, policy: { branch: 'main' } })
    expect(report.errors).toEqual([])
    expect(report.status).toBe('valid')
    expect(report.packages).toContainEqual(expect.objectContaining({ name: 'unpublished-consumer', currentVersion: '1.0.0', newVersion: '1.0.0', status: 'valid' }))
    expect(report.files).toContainEqual(expect.objectContaining({ path: 'packages/nested/consumer/CHANGELOG.md', status: 'expected' }))
    expect(await readFile(path.join(data.cwd, '.changeset/ledger.yaml'), 'utf8')).not.toContain('consumer@')
  }, 60000)

  it('ignores malformed nonworkspace and excluded fixtures while rejecting changes to those files', async () => {
    const data = await prepared({ malformedFixtures: true })
    const report = await validateReleasePreparation({ ...data, policy: { branch: 'main' } })
    expect(report.errors).toEqual([])
    expect(report.status).toBe('valid')
    await data.write('packages/excluded/package.json', '{ changed fixture')
    const changed = await validateReleasePreparation({ ...data, head: data.commit(), policy: { branch: 'main' } })
    expect(changed.status).toBe('invalid')
    expect(changed.files).toContainEqual(expect.objectContaining({ path: 'packages/excluded/package.json', status: 'unexpected' }))
  }, 60000)

  it.each([false, true])('preserves native publishConfig identity and registry semantics (alternate registry: %s)', async (publishRegistry) => {
    const data = await prepared({ publishAlias: true, publishRegistry })
    const report = await validateReleasePreparation({ ...data, policy: { branch: 'main' } })
    expect(report.errors).toEqual([])
    expect(report.status).toBe('valid')
    const nativeManifest = JSON.parse(await readFile(path.join(data.cwd, 'packages/nested/consumer/package.json'), 'utf8'))
    expect(report.packages).toContainEqual(expect.objectContaining({ name: 'consumer', newVersion: nativeManifest.version, status: 'valid' }))
    if (publishRegistry) {
      const filename = 'packages/b/package.json'
      const manifest = JSON.parse(await readFile(path.join(data.cwd, filename), 'utf8'))
      manifest.publishConfig.directory = 'unverified-output'
      await data.write(filename, JSON.stringify(manifest))
      const changed = await validateReleasePreparation({ ...data, head: data.commit(), policy: { branch: 'main' } })
      expect(changed.status).toBe('invalid')
      expect(changed.files).toContainEqual(expect.objectContaining({ path: filename, status: 'mismatch' }))
    }
  }, 60000)

  it('replays prerelease lanes using the native solver', async () => {
    const data = await prepared({ lane: 'alpha' })
    const report = await validateReleasePreparation({ ...data, policy: { branch: 'alpha' } })
    expect(report.errors).toEqual([])
    expect(report.status).toBe('valid')
    expect(report.packages.filter(pkg => pkg.publishCandidate).every(pkg => pkg.lane === 'alpha' && pkg.newVersion.includes('-alpha.'))).toBe(true)
    const wrongLine = await validateReleasePreparation({ ...data, policy: { branch: 'main' } })
    expect(wrongLine.status).toBe('invalid')
  }, 60000)

  it.each(['manifest', 'ledger', 'old-changelog', 'source', 'consumed-intent', 'dependency'])('rejects a tampered %s while a release-like branch never exempts it', async (kind) => {
    const data = await prepared()
    if (kind === 'manifest' || kind === 'dependency') {
      const filename = kind === 'manifest' ? 'packages/a/package.json' : 'packages/nested/consumer/package.json'
      const manifest = JSON.parse(await readFile(path.join(data.cwd, filename), 'utf8'))
      if (kind === 'manifest') {
        manifest.scripts.version = 'node malicious.cjs'
      }
      else {
        manifest.dependencies.a = 'workspace:^9.0.0'
      }
      await data.write(filename, JSON.stringify(manifest))
    }
    else if (kind === 'ledger') {
      await data.write('.changeset/ledger.yaml', '{}\n')
    }
    else if (kind === 'old-changelog') {
      const filename = 'packages/a/CHANGELOG.md'
      await data.write(filename, (await readFile(path.join(data.cwd, filename), 'utf8')).replace('Original release.', 'Rewritten history.'))
    }
    else if (kind === 'consumed-intent') {
      await data.write('.changeset/test.md', data.git('show', `${data.base}:.changeset/test.md`))
    }
    else {
      await data.write('packages/a/src/backdoor.ts', 'export const injected = true\n')
    }
    const head = data.commit()
    data.git('checkout', '-qb', 'release/pnpm-version-suspicious')
    const report = await validateReleasePreparation({ ...data, head, policy: { branch: 'main' } })
    expect(report.status).toBe('invalid')
    expect(report.files.some(file => ['mismatch', 'missing', 'unexpected'].includes(file.status))).toBe(true)
  }, 60000)

  it('requires exact generated-output digests or a trusted callback and never delegates native metadata', async () => {
    const data = await prepared()
    const output = 'release inventory\n'
    await data.write('generated/inventory.txt', output)
    const head = data.commit()
    expect((await validateReleasePreparation({ ...data, head, policy: { branch: 'main' } })).status).toBe('invalid')
    const sha256 = createHash('sha256').update(output).digest('hex')
    const digest = await validateReleasePreparation({ ...data, head, policy: { branch: 'main', generatedFiles: [{ path: 'generated/inventory.txt', sha256 }] } })
    expect(digest.status).toBe('valid')
    expect(digest.files).toContainEqual(expect.objectContaining({ path: 'generated/inventory.txt', status: 'custom-verified' }))
    const callback = await validateReleasePreparation({ ...data, head, policy: { branch: 'main', generatedFiles: [{ path: 'generated/inventory.txt', validate: context => context.before === null && Buffer.from(context.after!).toString() === output }] } })
    expect(callback.status).toBe('valid')
    for (const declarations of [
      [{ path: 'packages/a/package.json', sha256 }],
      [{ path: '../outside', sha256 }],
      [{ path: 'generated/inventory.txt', sha256 }, { path: 'generated/inventory.txt', sha256 }],
    ]) {
      expect((await validateReleasePreparation({ ...data, head, policy: { branch: 'main', generatedFiles: declarations } })).status).toBe('invalid')
    }
  }, 60000)

  it('reads CLI policy from the frozen base and bypasses executable checkout configuration', async () => {
    const data = await fixture()
    directories.push(data.cwd)
    await data.write('release-validation.json', JSON.stringify({ branch: 'main' }))
    const base = data.commit()
    const head = data.prepare()
    await data.write('release-validation.json', JSON.stringify({ branch: 'unknown' }))
    await data.write('repoctl.config.mjs', 'throw new Error("must never load candidate config")')
    expect(readReleasePreparationPolicy({ cwd: data.cwd, base, path: 'release-validation.json' })).toEqual({ branch: 'main' })
    const result = crossSpawn.sync(process.execPath, [path.resolve(import.meta.dirname, '../../../../bin/repo.js'), 'release', 'validate-preparation', '--base', base, '--head', head, '--policy', 'release-validation.json', '--json'], {
      cwd: data.cwd,
      env: { ...data.env, NODE_ENV: 'production' },
      encoding: 'utf8',
      timeout: 60000,
    })
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout).status).toBe('valid')
  }, 60000)

  it('fails closed for mutable refs, empty preparation, unknown policy and executable versioning extensions', async () => {
    const data = await prepared()
    expect((await validateReleasePreparation({ ...data, head: 'HEAD', policy: { branch: 'main' } })).status).toBe('invalid')
    expect((await validateReleasePreparation({ ...data, base: data.head, policy: { branch: 'main' } })).status).toBe('invalid')
    expect((await validateReleasePreparation({ ...data, policy: { branch: 'release/pnpm-version' } })).status).toBe('invalid')
    expect((await validateReleasePreparation({ ...data, policy: { branch: 'main', unexpected: true } as ReleasePreparationPolicy })).status).toBe('invalid')
    data.git('checkout', '--detach', data.base)
    await data.write('pnpm-workspace.yaml', 'packages: [packages/**]\nversioning:\n  changelog: {plugin: ./hook.cjs}\n')
    const base = data.commit()
    const report = await validateReleasePreparation({ ...data, base, policy: { branch: 'main' } })
    expect(report.status).toBe('invalid')
    expect(report.errors[0]?.detail).toContain('changelog')
  }, 60000)
})
