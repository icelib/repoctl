import type { BootstrapManifest, BootstrapOptions } from './types'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { prerelease, valid, validRange } from 'semver'
import validatePackageName from 'validate-npm-package-name'
import { dependencyReferences } from '../../package-check/dependencies'
import { consumerEntries } from '../../package-check/entries'
import { readSnapshotArchive } from '../snapshot/archive'
import { positive, record, sha } from '../snapshot/prepared/github/client'

export const bootstrapRegistry = 'https://registry.npmjs.org/'
export const bootstrapWorkflow = '.github/workflows/release.yml'

/** 共享入口与跨作业合同使用同一 npm 标签语法，保留受管快照渠道。 */
export function validateBootstrapTag(tag: string) {
  assert.ok(/^[a-z][a-z\d.-]*$/u.test(tag) && !validRange(tag) && tag !== 'snapshot-nightly' && !/^snapshot-pr-\d+$/u.test(tag), 'Bootstrap requires a prerelease dist-tag; repoctl snapshot channels are reserved')
  return tag
}

/** 发布与恢复只读取纯数据；归档路径固定，不能指定候选可执行文件。 */
export function validateBootstrapManifest(value: unknown): BootstrapManifest {
  const item = record(value, 'bootstrap manifest')
  assert.equal(item['schemaVersion'], 1)
  assert.equal(item['registry'], bootstrapRegistry)
  assert.ok(typeof item['tag'] === 'string')
  validateBootstrapTag(item['tag'])
  assert.ok(Array.isArray(item['protectedTags']) && item['protectedTags'].includes('latest') && item['protectedTags'].every(tag => typeof tag === 'string') && !item['protectedTags'].includes(item['tag']))
  const source = record(item['source'])
  assert.ok(typeof source['repository'] === 'string' && /^[\w-]+\/[\w.-]+$/u.test(source['repository']))
  positive(source['repositoryId'], 'repository ID')
  positive(source['runId'], 'run ID')
  positive(source['runAttempt'], 'run attempt')
  sha(source['commit'])
  assert.ok(typeof source['branch'] === 'string' && source['branch'].length > 0 && !/\p{Cc}/u.test(source['branch']))
  assert.equal(source['workflowRef'], `${source['repository']}/${bootstrapWorkflow}@refs/heads/${source['branch']}`)
  const pkg = record(item['package'])
  assert.ok(typeof pkg['name'] === 'string' && validatePackageName(pkg['name']).validForNewPackages)
  assert.ok(typeof pkg['version'] === 'string' && valid(pkg['version']) === pkg['version'] && prerelease(pkg['version']) !== null)
  assert.ok(typeof pkg['currentVersion'] === 'string' && valid(pkg['currentVersion']))
  assert.ok(typeof pkg['directory'] === 'string' && !/[\\:\p{Cc}]/u.test(pkg['directory']) && !pkg['directory'].startsWith('/') && pkg['directory'].split('/').every(part => part && part !== '..' && part !== '.'))
  assert.equal(pkg['tarball'], 'tarballs/package.tgz')
  assert.ok(typeof pkg['integrity'] === 'string' && /^sha512-[A-Za-z\d+/]{86}==$/u.test(pkg['integrity']))
  assert.ok(Array.isArray(pkg['files']) && pkg['files'].length > 0 && pkg['files'].every(file => typeof file === 'string' && !/[\\:\p{Cc}]/u.test(file) && !file.startsWith('/') && file.split('/').every(part => part && part !== '..' && part !== '.')))
  assert.ok(typeof item['pnpmVersion'] === 'string' && valid(item['pnpmVersion']))
  const checks = record(item['checks'])
  const check = record(checks['package'])
  assert.equal(checks['build'], 'passed')
  assert.equal(check['status'], 'passed')
  assert.equal(check['name'], pkg['name'])
  assert.deepEqual(check['files'], pkg['files'])
  assert.ok(Array.isArray(check['diagnostics']) && check['diagnostics'].every(diagnostic => record(diagnostic)['severity'] !== 'error'))
  const packed = record(item['packedManifest'])
  assert.equal(packed['name'], pkg['name'])
  assert.equal(packed['version'], pkg['version'])
  assert.notEqual(packed['private'], true)
  const publish = record(packed['publishConfig'])
  assert.ok(Object.keys(publish).every(key => ['registry', 'tag', 'access', 'provenance'].includes(key)), 'Bootstrap packed publishConfig contains unsupported overrides')
  assert.equal(publish['registry'], bootstrapRegistry)
  assert.equal(publish['tag'], item['tag'])
  assert.equal(publish['access'], 'public')
  assert.ok(publish['provenance'] === undefined || publish['provenance'] === true)
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    if (packed[field] !== undefined) {
      assert.ok(Object.entries(record(packed[field])).every(([alias, range]) => validatePackageName(alias).validForNewPackages && typeof range === 'string'), 'Bootstrap packed dependency map is invalid')
    }
  }
  assert.ok(dependencyReferences(packed, '.').every(reference => reference.protocol === 'registry' && validRange(reference.range)), 'Bootstrap packed dependencies must use registry semver ranges')
  assert.deepEqual(item['entries'], consumerEntries(packed, pkg['files'] as string[]))
  return item as unknown as BootstrapManifest
}

export function bootstrapIntegrity(bytes: Uint8Array) {
  return `sha512-${createHash('sha512').update(bytes).digest('base64')}`
}

export async function validateBootstrapArchive(manifest: BootstrapManifest, bytes: Uint8Array) {
  assert.equal(bootstrapIntegrity(bytes), manifest.package.integrity, 'Bootstrap tarball integrity differs from the frozen manifest')
  assert.ok(bytes.byteLength <= 128 * 1024 * 1024, 'Bootstrap tarball exceeds the compressed size limit')
  const entries = await readSnapshotArchive(gunzipSync(bytes, { maxOutputLength: 256 * 1024 * 1024 }))
  assert.ok(entries.every(entry => !(entry.mode & 0o7000)), 'Bootstrap archive contains unsafe permission bits')
  const files = entries.filter(entry => entry.type === 'File').map(entry => entry.path.slice('package/'.length)).sort()
  assert.deepEqual(files, [...manifest.package.files].sort(), 'Bootstrap file inventory differs')
  const entry = entries.find(entry => entry.path === 'package/package.json' && entry.type === 'File')
  assert.ok(entry, 'Bootstrap archive has no package.json')
  assert.deepEqual(JSON.parse(Buffer.from(entry.data).toString('utf8')), manifest.packedManifest, 'Packed bootstrap manifest differs from the checked bytes')
  return entries
}

export function matchBootstrapRequest(manifest: BootstrapManifest, options: BootstrapOptions) {
  assert.equal(manifest.package.name, options.packageName, 'Bootstrap package differs from the dispatch input')
  assert.equal(manifest.package.version, options.version, 'Bootstrap version differs from the dispatch input')
  assert.equal(manifest.tag, options.tag ?? 'alpha', 'Bootstrap tag differs from the dispatch input')
}
