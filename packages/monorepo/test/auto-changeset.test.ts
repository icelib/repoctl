import { describe, expect, it } from 'vitest'
import {
  backfillPullRequests,
  changesetPath,
  hasChangeset,
  isPublishableManifest,
  isReleaseBranch,
  packageDirectories,
  processPullRequest,
  releaseLevel,
  renderChangeset,
} from '../../../.github/auto-changeset/index.mjs'

describe('automatic changesets', () => {
  it('finds unique package directories and ignores non-package paths', () => {
    expect(packageDirectories([
      'packages/zeta/src/index.ts',
      'packages/alpha/package.json',
      'packages/zeta/dist/index.js',
      'README.md',
    ])).toEqual(['zeta', 'alpha'])
    expect(packageDirectories(['packages/zeta/dist/index.js'])).toEqual([])
  })

  it('prioritizes major over minor and defaults to patch', () => {
    expect(releaseLevel([])).toBe('patch')
    expect(releaseLevel([{ name: 'release:minor' }])).toBe('minor')
    expect(releaseLevel(['release:minor', 'release:major'])).toBe('major')
  })

  it('renders sorted package frontmatter and a single-line summary', () => {
    expect(renderChangeset({
      packages: ['zeta', '@scope/alpha'],
      level: 'minor',
      number: 12,
      title: 'Add\nnew capability',
    })).toBe('---\n"@scope/alpha": minor\nzeta: minor\n---\n\nAdd new capability (#12)\n')
  })

  it('filters private manifests and recognizes release branches and intents', () => {
    expect(isPublishableManifest({ name: 'public' })).toBe(true)
    expect(isPublishableManifest({ name: 'private', private: true })).toBe(false)
    expect(isReleaseBranch('release/pnpm-version')).toBe(true)
    expect(isReleaseBranch('feature/release')).toBe(false)
    expect(hasChangeset(['.changeset/manual.md'])).toBe(true)
    expect(changesetPath(42)).toBe('.changeset/auto-pr-42.md')
  })

  it('commits same-repository PR changesets', async () => {
    const calls: string[] = []
    const client = {
      getPullRequest: async () => ({
        number: 42,
        title: 'Fix package',
        draft: false,
        labels: [],
        head: { ref: 'feature/fix', sha: 'head', repo: { full_name: 'acme/repo' } },
        base: { ref: 'main', repo: { full_name: 'acme/repo' } },
      }),
      getPullRequestFiles: async () => [{ filename: 'packages/demo/src/index.ts' }],
      getContent: async (path: string) => path === 'packages/demo/package.json' ? '{"name":"demo"}' : undefined,
      getRef: async () => ({ object: { sha: 'head' } }),
      getCommit: async () => ({ tree: { sha: 'tree' } }),
      createBlob: async () => ({ sha: 'blob' }),
      createTree: async () => ({ sha: 'next-tree' }),
      createCommit: async () => ({ sha: 'commit' }),
      updateRef: async () => { calls.push('updateRef') },
    }
    await expect(processPullRequest(client as never, 42)).resolves.toEqual({ action: 'committed', number: 42, path: '.changeset/auto-pr-42.md' })
    expect(calls).toEqual(['updateRef'])
  })

  it.each(['unchanged', 'manual', 'edited', 'draft', 'release', 'private'])(
    'does not append another commit for %s release intent',
    async (scenario) => {
      const generated = renderChangeset({ packages: ['demo'], number: 42, title: 'Fix package' })
      const client = {
        getPullRequest: async () => ({
          number: 42,
          title: 'Fix package',
          draft: scenario === 'draft',
          labels: [],
          head: { ref: scenario === 'release' ? 'release/pnpm-version' : 'renovate/demo', sha: 'head', repo: { full_name: 'acme/repo' } },
          base: { ref: 'main', repo: { full_name: 'acme/repo' } },
        }),
        getPullRequestFiles: async () => [
          { filename: 'packages/demo/package.json' },
          { filename: scenario === 'manual' ? '.changeset/manual.md' : changesetPath(42) },
        ],
        getContent: async (path: string) => path.endsWith('package.json')
          ? JSON.stringify({ name: 'demo', private: scenario === 'private' })
          : scenario === 'edited' ? `${generated}\nMaintainer notes.\n` : generated,
        getRef: async () => { throw new Error('Must not attempt a write') },
      }
      await expect(processPullRequest(client as never, 42)).resolves.toEqual({ action: 'skipped', number: 42 })
    },
  )

  it('comments once instead of writing to a fork PR', async () => {
    const comments: string[] = []
    const client = {
      getPullRequest: async () => ({
        number: 43,
        title: 'Forked fix',
        draft: false,
        labels: [],
        head: { ref: 'feature/fix', sha: 'head', repo: { full_name: 'contributor/repo' } },
        base: { ref: 'main', repo: { full_name: 'acme/repo' } },
      }),
      getPullRequestFiles: async () => [{ filename: 'packages/demo/src/index.ts' }],
      getContent: async (path: string) => path === 'packages/demo/package.json' ? '{"name":"demo"}' : undefined,
      listComments: async () => [],
      createComment: async (_number: number, body: string) => { comments.push(body) },
    }
    await expect(processPullRequest(client as never, 43)).resolves.toEqual({ action: 'commented', number: 43 })
    expect(comments[0]).toContain('repoctl-auto-changeset')
  })

  it('updates an untouched generated changeset when the release label changes', async () => {
    const calls: string[] = []
    const client = {
      getPullRequest: async () => ({
        number: 44,
        title: 'Labeled fix',
        draft: false,
        labels: [{ name: 'release:minor' }],
        head: { ref: 'feature/fix', sha: 'head', repo: { full_name: 'acme/repo' } },
        base: { ref: 'main', repo: { full_name: 'acme/repo' } },
      }),
      getPullRequestFiles: async () => [{ filename: 'packages/demo/src/index.ts' }, { filename: '.changeset/auto-pr-44.md' }],
      getContent: async (path: string) => path === 'packages/demo/package.json' ? '{"name":"demo"}' : '---\ndemo: patch\n---\n\nLabeled fix (#44)\n',
      getRef: async () => ({ object: { sha: 'head' } }),
      getCommit: async () => ({ tree: { sha: 'tree' } }),
      createBlob: async () => ({ sha: 'blob' }),
      createTree: async () => ({ sha: 'next-tree' }),
      createCommit: async () => ({ sha: 'commit' }),
      updateRef: async () => { calls.push('updateRef') },
    }
    await expect(processPullRequest(client as never, 44)).resolves.toEqual({ action: 'committed', number: 44, path: '.changeset/auto-pr-44.md' })
    expect(calls).toEqual(['updateRef'])
  })

  it('creates one backfill PR for merged publishable PRs', async () => {
    const created: string[] = []
    const client = {
      getRef: async () => ({ object: { sha: 'main' } }),
      getPullRequest: async (number: number) => ({ number, title: `PR ${number}`, merged_at: 'now', merge_commit_sha: `merge-${number}`, labels: [], base: { ref: 'main' } }),
      getPullRequestFiles: async () => [{ filename: 'packages/demo/src/index.ts' }],
      getContent: async (path: string) => path.endsWith('package.json') ? '{"name":"demo"}' : undefined,
      createBranch: async (branch: string) => { created.push(branch) },
      getCommit: async () => ({ tree: { sha: 'tree' } }),
      createBlob: async () => ({ sha: 'blob' }),
      createTree: async () => ({ sha: 'next-tree' }),
      createCommit: async () => ({ sha: 'commit' }),
      updateRef: async () => undefined,
      createPullRequest: async (input: { head: string }) => {
        created.push(input.head)
        return { number: 900 }
      },
    }
    const result = await backfillPullRequests(client as never, [864], { runId: 'test' })
    expect(result.pullRequest).toEqual({ number: 900 })
    expect(created).toEqual(['automation/changeset-backfill-test', 'automation/changeset-backfill-test'])
  })
})
