import type { AutoChangesetOptions } from '@icebreakers/monorepo'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'

export const headSha = 'a'.repeat(40)
export const baseSha = 'b'.repeat(40)
export const policySha = 'c'.repeat(40)
export const commitSha = 'd'.repeat(40)
export const repository = 'acme/workspace'
export const workflowPath = '.github/workflows/repoctl-auto-changeset.yml'
export const workflow = `jobs:
  plan:
    name: Plan automatic changeset
  apply:
    name: Apply automatic changeset
    environment: release-intent-write
`

export function manifest(name: string, extra: Record<string, unknown> = {}) {
  return JSON.stringify({ name, version: '1.0.0', ...extra })
}

export function workspaceFiles() {
  return {
    'package.json': manifest('root', { private: true, scripts: { prepare: 'throw-do-not-execute' } }),
    'pnpm-workspace.yaml': 'packages:\n  - packages/*\n  - packages-runtime/*\n  - mpcore/packages/*\n  - "!packages/excluded"\n',
    'packages/main/package.json': manifest('@fixture/main'),
    'packages/excluded/package.json': manifest('@fixture/excluded'),
    'packages-runtime/foo/package.json': manifest('@fixture/foo'),
    'mpcore/packages/constants/package.json': manifest('@fixture/constants', { private: true }),
    'packages/consumer/package.json': manifest('@fixture/consumer', { dependencies: { aliased: 'workspace:@fixture/constants@*' } }),
  }
}

type RecordValue = Record<string, unknown>
export interface FixtureOptions {
  head?: Record<string, string>
  base?: Record<string, string>
  trusted?: Record<string, string>
  files?: Array<{ filename: string, status: string, previous_filename?: string }>
  title?: string
  labels?: string[]
  fork?: boolean
}

export function githubFixture(options: FixtureOptions = {}) {
  const baseFiles = options.base ?? workspaceFiles()
  const headFiles = options.head ?? { ...baseFiles }
  const treeResponses = new Map<string, RecordValue>()
  const blobResponses = new Map<string, RecordValue>()
  const commits = new Map<string, RecordValue>()
  function tree(commit: string, files: Record<string, string>) {
    const entries = Object.entries(files).map(([filename, content]) => {
      const bytes = Buffer.from(content)
      const sha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
      blobResponses.set(sha, { sha, encoding: 'base64', size: bytes.length, content: bytes.toString('base64') })
      return { path: filename, type: 'blob', mode: '100644', sha }
    })
    const treeSha = createHash('sha1').update(JSON.stringify(entries)).digest('hex')
    treeResponses.set(treeSha, { sha: treeSha, truncated: false, tree: entries })
    commits.set(commit, { sha: commit, tree: { sha: treeSha } })
  }
  tree(baseSha, baseFiles)
  tree(headSha, headFiles)
  tree(policySha, options.trusted ?? { [workflowPath]: workflow })
  const changed = options.files ?? [{ filename: 'packages-runtime/foo/src/index.ts', status: 'modified' }]
  const pull: RecordValue = {
    number: 17,
    title: options.title ?? 'fix: compatible update',
    state: 'open',
    draft: false,
    changed_files: changed.length,
    head: { sha: headSha, ref: 'fix/runtime', repo: { id: options.fork ? 2 : 1, full_name: options.fork ? 'someone/workspace' : repository } },
    base: { sha: baseSha, ref: 'main', repo: { id: 1, full_name: repository } },
  }
  const labels = options.labels ?? []
  Object.defineProperty(pull, 'labels', { enumerable: true, get: () => labels.map(name => ({ name })) })
  const mutations: Array<{ path: string, body: unknown }> = []
  const state: { branchHead: string, beforeMutation?: () => void } = { branchHead: headSha }
  const overrides = new Map<string, unknown | (() => unknown)>()
  const requests: string[] = []
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    const pathname = url.pathname.replace(`/repos/${repository}`, '')
    const route = `${pathname}${url.search}`
    requests.push(route)
    if (overrides.has(route)) {
      const override = overrides.get(route)
      return Response.json(typeof override === 'function' ? override() : override)
    }
    if (init?.method && init.method !== 'GET') {
      const body = JSON.parse(String(init.body))
      mutations.push({ path: pathname, body })
      state.beforeMutation?.()
      if (pathname === '/graphql' && body.variables.input.expectedHeadOid === state.branchHead) {
        state.branchHead = commitSha
        return Response.json({ data: { createCommitOnBranch: { commit: { oid: commitSha } } } })
      }
      if (pathname === '/graphql') {
        return Response.json({ errors: [{ message: 'Expected head OID does not match the branch head.' }] })
      }
      throw new Error(`Unexpected mutation: ${route}`)
    }
    let value: unknown
    if (pathname === '') {
      value = { id: 1, full_name: repository, default_branch: 'main' }
    }
    else if (pathname === '/pulls/17') {
      value = pull
    }
    else if (pathname === '/issues/17/labels') {
      const page = Number(url.searchParams.get('page'))
      value = labels.slice((page - 1) * 100, page * 100).map(name => ({ name }))
    }
    else if (pathname === '/git/ref/heads/main') {
      value = { object: { sha: policySha } }
    }
    else if (pathname === '/pulls/17/files') {
      const page = Number(url.searchParams.get('page'))
      value = changed.slice((page - 1) * 100, page * 100)
    }
    else if (pathname.startsWith('/git/commits/')) {
      value = commits.get(pathname.slice('/git/commits/'.length))
    }
    else if (pathname.startsWith('/git/trees/')) {
      value = treeResponses.get(pathname.slice('/git/trees/'.length))
    }
    else if (pathname.startsWith('/git/blobs/')) {
      value = blobResponses.get(pathname.slice('/git/blobs/'.length))
    }
    else if (pathname === '/actions/runs/91/attempts/1') {
      value = { id: 91, run_attempt: 1, event: 'workflow_dispatch', path: workflowPath, head_branch: 'main', head_sha: policySha, repository: { id: 1 } }
    }
    else if (pathname === '/environments/release-intent-write') {
      value = { id: 70, name: 'release-intent-write', can_admins_bypass: false, protection_rules: [{ type: 'required_reviewers', reviewers: [{ id: 80 }] }] }
    }
    else if (pathname === '/actions/runs/91/approvals') {
      value = [{ state: 'approved', environments: [{ id: 70, name: 'release-intent-write' }] }]
    }
    else if (pathname === '/actions/runs/91/attempts/1/jobs') {
      value = { total_count: 2, jobs: [
        { id: 92, run_id: 91, run_attempt: 1, name: 'Plan automatic changeset', status: 'completed', conclusion: 'success', started_at: '2026-10-26T00:00:00Z', completed_at: '2026-10-26T00:01:00Z' },
        { id: 93, run_id: 91, run_attempt: 1, name: 'Apply automatic changeset', status: 'in_progress', conclusion: null, started_at: '2026-10-26T00:02:00Z' },
      ] }
    }
    if (value === undefined) {
      throw new Error(`Unexpected fixture request: ${route}`)
    }
    return Response.json(value)
  }
  const api: AutoChangesetOptions = { repository, pullRequest: 17, token: 'test-only', fetch, env: {} }
  return { api, pull, labels, changed, mutations, state, overrides, requests, treeResponses, blobResponses, headFiles }
}
