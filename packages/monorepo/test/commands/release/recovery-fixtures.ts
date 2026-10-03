import type { GitHubOperations, GitHubRelease, ReleaseCiOptions, ReleaseLifecycleState } from '@icebreakers/monorepo'
import { vi } from 'vitest'
import { a, b, publishHarness } from './publish-fixtures'

export const source = '1'.repeat(40)
export const later = '2'.repeat(40)
export const keyOf = (pkg: { name: string, version: string }) => `${pkg.name}@${pkg.version}`

export function recoveryRemote() {
  const versions = new Set<string>()
  const tags = new Map<string, string>()
  const releases = new Map<string, GitHubRelease>()
  let state: ReleaseLifecycleState | undefined
  let revision = 0
  const github = {
    ensurePullRequest: vi.fn(),
    listReleases: vi.fn(async () => [...releases.values()]),
    ensureTag: vi.fn(async ({ tag, target }) => {
      if (tags.has(tag) && tags.get(tag) !== target) {
        throw new Error('Tag target conflict')
      }
      tags.set(tag, target)
    }),
    ensureRelease: vi.fn(async ({ tag, target, name, body, prerelease }) => {
      const value = { id: releases.size + 1, html_url: 'https://example.test/release', tag_name: tag, target_commitish: target, name: name ?? tag, body: body ?? '', prerelease: prerelease ?? false, draft: false }
      releases.set(tag, value)
      return value
    }),
    readReleaseState: vi.fn(async () => state ? { revision: String(revision), state: structuredClone(state) } : undefined),
    writeReleaseState: vi.fn(async (_key, next, previous) => {
      if (previous !== (revision ? String(revision) : undefined)) {
        throw new Error('concurrent checkpoint conflict')
      }
      state = structuredClone(next)
      return String(++revision)
    }),
  } satisfies GitHubOperations
  return { versions, tags, releases, github, state: () => state }
}

export async function recoveryRunner(remote: ReturnType<typeof recoveryRemote>, uploaded = [a, b]) {
  const h = await publishHarness([{ status: 0, summary: uploaded }], spec => remote.versions.has(spec) ? '1.0.0' : '')
  const committedFiles = new Map([
    ['packages/repoctl/package.json', JSON.stringify(a)],
    ['packages/zz-b/package.json', JSON.stringify(b)],
  ])
  const original = h.spawn.getMockImplementation()!
  h.spawn.mockImplementation((command, args, options) => {
    if (command === 'npm' && args.includes('--json')) {
      return remote.versions.has(args[1]!)
        ? { status: 0, stdout: JSON.stringify({ 'version': '1.0.0', 'gitHead': source, 'dist-tags': { latest: '1.0.0', alpha: '1.0.0' } }) }
        : { status: 1, stdout: '', stderr: 'E404 Not Found' }
    }
    if (command === 'git' && args[0] === 'log' && args[1] === '--first-parent') {
      return { status: 0, stdout: committedFiles.has(args[4]!) ? source : '' }
    }
    if (command === 'git' && args[1] === '--is-shallow-repository') {
      return { status: 0, stdout: 'false' }
    }
    if (command === 'git' && args[0] === 'ls-tree') {
      const filename = args[3]!
      return { status: 0, stdout: args[1] === source && committedFiles.has(filename) ? `100644 blob ${'b'.repeat(40)}\t${filename}` : '' }
    }
    if (command === 'git' && args[0] === 'show' && args[1]?.startsWith(`${source}:`)) {
      const contents = committedFiles.get(args[1].slice(source.length + 1))
      return { status: contents === undefined ? 128 : 0, stdout: contents ?? '' }
    }
    const result = original(command, args, options)
    if (command === 'pnpm' && args[0] === 'publish') {
      uploaded.forEach(pkg => remote.versions.add(keyOf(pkg)))
    }
    return result
  })
  const options: ReleaseCiOptions = {
    ...h.options,
    mode: 'publish',
    github: remote.github,
    env: { GITHUB_REPOSITORY: 'acme/repo', GITHUB_SHA: source },
    config: { qualityScripts: ['quality'], hooks: { beforePublish: ['before'], afterPublish: [{ script: 'after', idempotent: true }] } },
  }
  return { ...h, options }
}
