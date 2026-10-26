import type { VerifySnapshotRunOptions } from '../../../../../../src/commands/release/snapshot/prepared/github/types'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { createSnapshotFreezeRecord } from '../../../../../../src/commands/release/snapshot/prepared/github/evidence'
import { bundle } from '../fixture'

function crc32(bytes: Uint8Array) {
  let result = 0xFFFFFFFF
  for (const byte of bytes) {
    result ^= byte
    for (let bit = 0; bit < 8; bit++) {
      result = (result >>> 1) ^ ((result & 1) ? 0xEDB88320 : 0)
    }
  }
  return (result ^ 0xFFFFFFFF) >>> 0
}

/** Stored ZIP fixtures keep malformed paths and modes controllable without filesystem extraction. */
export function zip(files: Iterable<[string, Uint8Array]>, attributes = new Map<string, number>()) {
  const local: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  let count = 0
  for (const [name, contents] of files) {
    const filename = Buffer.from(name)
    const bytes = Buffer.from(contents)
    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034B50)
    header.writeUInt16LE(20, 4)
    header.writeUInt32LE(crc32(bytes), 14)
    header.writeUInt32LE(bytes.length, 18)
    header.writeUInt32LE(bytes.length, 22)
    header.writeUInt16LE(filename.length, 26)
    local.push(header, filename, bytes)
    const directory = Buffer.alloc(46)
    directory.writeUInt32LE(0x02014B50)
    directory.writeUInt16LE(0x0314, 4)
    directory.writeUInt16LE(20, 6)
    directory.writeUInt32LE(crc32(bytes), 16)
    directory.writeUInt32LE(bytes.length, 20)
    directory.writeUInt32LE(bytes.length, 24)
    directory.writeUInt16LE(filename.length, 28)
    directory.writeUInt32LE(((attributes.get(name) ?? 0o100644) << 16) >>> 0, 38)
    directory.writeUInt32LE(offset, 42)
    central.push(directory, filename)
    offset += header.length + filename.length + bytes.length
    count++
  }
  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054B50)
  end.writeUInt16LE(count, 8)
  end.writeUInt16LE(count, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...local, directory, end])
}

export function githubFixture(prepared = bundle()) {
  const source = prepared.plan.source
  const workflow = 'name: trusted snapshot build\n'
  const planBytes = zip(new Map([['snapshot-plan.json', Buffer.from(JSON.stringify(prepared.plan))]]))
  const buildBytes = zip(prepared.files)
  const hash = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`
  const planArtifact = { id: 1001, digest: hash(planBytes) }
  const buildArtifact = { id: 1002, digest: hash(buildBytes) }
  const anchor = createSnapshotFreezeRecord(prepared.plan, planArtifact)
  const repository = { id: source.repositoryId, full_name: source.repository }
  const run = {
    id: source.runId,
    run_attempt: source.runAttempt,
    workflow_id: source.workflowId,
    path: source.workflowPath,
    head_sha: source.workflowSha,
    head_branch: 'main',
    event: 'workflow_dispatch',
    status: 'completed',
    conclusion: 'success',
    repository,
    head_repository: repository,
    pull_requests: [],
  }
  const jobs = [
    { id: 501, name: 'Freeze snapshot plan', started_at: '2026-10-26T01:00:00Z', completed_at: '2026-10-26T01:01:00Z' },
    { id: 502, name: 'Build snapshot packages', started_at: '2026-10-26T01:01:01Z', completed_at: '2026-10-26T01:02:00Z' },
  ].map(job => ({ ...job, run_id: source.runId, run_attempt: source.runAttempt, status: 'completed', conclusion: 'success' }))
  const metadata = (artifact: typeof planArtifact, bytes: Uint8Array, kind: string) => ({
    ...artifact,
    name: `snapshot-${kind}-${source.runId}-${source.runAttempt}`,
    expired: false,
    size_in_bytes: bytes.byteLength,
    workflow_run: { id: source.runId, repository_id: source.repositoryId, head_repository_id: source.repositoryId, head_sha: source.workflowSha },
  })
  const routes = new Map<string, unknown>([
    ['', { ...repository, default_branch: 'main' }],
    [`/actions/runs/${source.runId}`, run],
    [`/actions/workflows/${source.workflowId}`, { id: source.workflowId, path: source.workflowPath, state: 'active' }],
    ['/git/ref/heads/main', { object: { sha: source.baseSha } }],
    [`/compare/${source.workflowSha}...${source.baseSha}`, { status: 'ahead', merge_base_commit: { sha: source.workflowSha } }],
    [`/contents/${source.workflowPath}`, { type: 'file', encoding: 'base64', content: Buffer.from(workflow).toString('base64') }],
    [`/actions/runs/${source.runId}/attempts/${source.runAttempt}/jobs`, { jobs }],
    ['/environments/pr-snapshot', { id: 31, name: 'pr-snapshot', can_admins_bypass: false, protection_rules: [{ type: 'required_reviewers', reviewers: [{ type: 'User', reviewer: { id: 1, login: 'maintainer' } }] }] }],
    [`/actions/runs/${source.runId}/approvals`, [{ state: 'approved', environments: [{ id: 31, name: 'pr-snapshot' }] }]],
    [`/actions/artifacts/${planArtifact.id}`, metadata(planArtifact, planBytes, 'plan')],
    [`/actions/artifacts/${buildArtifact.id}`, metadata(buildArtifact, buildBytes, 'build')],
    [`/actions/runs/${source.runId}/artifacts`, { artifacts: [metadata(planArtifact, planBytes, 'plan'), metadata(buildArtifact, buildBytes, 'build')] }],
    [`/pulls/${source.pullRequest}`, { number: source.pullRequest, state: 'open', draft: false, mergeable: true, merge_commit_sha: source.mergeSha, head: { sha: source.headSha, ref: 'feature', repo: { ...repository, fork: false } }, base: { sha: source.baseSha, ref: source.baseRef, repo: repository } }],
    ['/git/ref/heads/feature', { object: { sha: source.headSha } }],
    [`/git/commits/${source.mergeSha}`, { sha: source.mergeSha, parents: [{ sha: source.baseSha }, { sha: source.headSha }] }],
  ])
  const downloads = new Map<string, Uint8Array>([
    ['/actions/jobs/501/logs', Buffer.from(`2026-10-26T01:00:59.0000000Z ${anchor}\n`)],
    [`/actions/artifacts/${planArtifact.id}/zip`, planBytes],
    [`/actions/artifacts/${buildArtifact.id}/zip`, buildBytes],
  ])
  const requests: Array<{ url: string, authorization: string | null, redirect: RequestRedirect | undefined }> = []
  const fetcher: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    requests.push({ url: url.href, authorization: new Headers(init?.headers).get('authorization'), redirect: init?.redirect })
    if (url.hostname === 'storage.example') {
      const bytes = downloads.get(url.pathname)
      if (!bytes) {
        throw new Error(`Unexpected fixture download ${url.pathname}`)
      }
      return new Response(Uint8Array.from(bytes), { status: 200 })
    }
    const path = url.pathname.replace(`/repos/${source.repository}`, '')
    if (downloads.has(path)) {
      return new Response(null, { status: 302, headers: { location: `https://storage.example${path}?signed=secret` } })
    }
    if (!routes.has(path)) {
      throw new Error(`Unexpected fixture GitHub request ${path}`)
    }
    return Response.json(routes.get(path))
  }
  const options: VerifySnapshotRunOptions = {
    repository: source.repository,
    runId: source.runId,
    runAttempt: source.runAttempt,
    token: 'github-secret',
    fetch: fetcher,
    policy: { workflowPath: source.workflowPath, workflowSha256: hash(Buffer.from(workflow)), environment: 'pr-snapshot' },
  }
  return { prepared, options, fetcher, routes, downloads, requests, run, jobs, anchor, planArtifact, buildArtifact }
}
