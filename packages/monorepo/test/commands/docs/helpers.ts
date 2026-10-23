import type { DocsCommandConfig, DocsDeploymentStageKey, DocsOptions, DocsStateStore, ReleaseCompletionRecord } from '@icebreakers/monorepo'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { expect } from 'vitest'

const roots: string[] = []

export async function expectDocsFailure(operation: Promise<unknown>, stage: DocsDeploymentStageKey, reason: string) {
  await expect(operation).rejects.toMatchObject({ report: {
    failedStage: stage,
    stages: expect.arrayContaining([expect.objectContaining({ stage, status: 'failed', reason })]),
  } })
}

export function git(cwd: string, ...args: string[]) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
}

export async function put(cwd: string, file: string, value: string) {
  await mkdir(path.dirname(path.join(cwd, file)), { recursive: true })
  await writeFile(path.join(cwd, file), value)
}

export function commit(cwd: string, message = 'fixture') {
  git(cwd, 'add', '.')
  git(cwd, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', message)
  const sha = git(cwd, 'rev-parse', 'HEAD')
  git(cwd, 'update-ref', 'refs/remotes/origin/main', sha)
  return sha
}

export const config: DocsCommandConfig = { sites: { website: {
  packages: ['core'],
  buildScript: 'docs:build',
  preview: { deployScript: 'docs:preview', url: 'https://next.example.invalid' },
  stable: { deployScript: 'docs:stable', url: 'https://docs.example.invalid' },
  patchPaths: ['website/**/*.md', 'website/**/*.svg'],
} } }

export function createStore(cwd: string) {
  const records = new Map<string, { revision: string, value: unknown }>()
  let revision = 0
  const writes: string[] = []
  const github: DocsStateStore = {
    async readBranchHead() {
      return git(cwd, 'rev-parse', 'refs/remotes/origin/main')
    },
    async readAutomationState(key) {
      return structuredClone(records.get(key))
    },
    async writeAutomationState(key, value, expected) {
      if (records.get(key)?.revision !== expected) {
        throw new Error('Concurrent checkpoint update')
      }
      const next = String(++revision)
      records.set(key, { revision: next, value: structuredClone(value) })
      writes.push(key)
      return next
    },
  }
  return { github, records, writes }
}

export function makeRecord(sha: string, overrides: Partial<Omit<ReleaseCompletionRecord, 'id'>> = {}): ReleaseCompletionRecord {
  const value: Omit<ReleaseCompletionRecord, 'id'> = {
    schemaVersion: 1,
    repository: 'example/project',
    branch: 'main',
    distTag: 'latest',
    sourceSha: sha,
    packages: [{ name: 'core', version: '1.0.0', sourceSha: sha }, { name: 'runtime', version: '1.0.0', sourceSha: sha }],
    releasedPackages: ['core', 'runtime'],
    checkpointKey: 'a'.repeat(64),
    ...overrides,
  }
  return { ...value, id: createHash('sha256').update(JSON.stringify(value)).digest('hex') }
}

export async function fixture() {
  const cwd = await mkdtemp(path.join(tmpdir(), 'repoctl-docs-test-'))
  roots.push(cwd)
  git(cwd, 'init', '-q', '-b', 'main')
  await put(cwd, 'package.json', JSON.stringify({ name: 'fixture', private: true, packageManager: 'pnpm@12.13.0' }))
  await put(cwd, 'pnpm-workspace.yaml', 'packages:\n  - packages/*\n')
  await put(cwd, 'pnpm-lock.yaml', 'lockfileVersion: 9.0\n')
  await put(cwd, 'packages/core/package.json', JSON.stringify({ name: 'core', version: '1.0.0', dependencies: { runtime: 'workspace:*' } }))
  await put(cwd, 'packages/runtime/package.json', JSON.stringify({ name: 'runtime', version: '1.0.0' }))
  await put(cwd, 'packages/core/src/index.ts', 'export const value = "released"\n')
  await put(cwd, 'packages/runtime/src/index.ts', 'export const runtime = true\n')
  await put(cwd, 'website/index.md', '# Stable\n\nOriginal explanation.\n')
  const sha = commit(cwd)
  const store = createStore(cwd)
  const record = makeRecord(sha)
  await store.github.writeAutomationState(`releases/${record.id}`, record)
  store.writes.length = 0
  const options: DocsOptions = {
    cwd,
    site: 'website',
    channel: 'stable',
    release: record.id,
    config: structuredClone(config),
    github: store.github,
    env: { ...process.env, GITHUB_REPOSITORY: 'example/project', GITHUB_ACTIONS: 'true', GITHUB_RUN_ID: '123', REPO_DOCS_CONCURRENCY_GROUP: 'docs-website-stable' },
  }
  return { cwd, sha, store, record, options }
}

export async function cleanup() {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
}
