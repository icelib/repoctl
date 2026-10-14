import fs from 'node:fs/promises'
import process from 'node:process'
import { createGitHubClient } from './github.mjs'

const CHANGESET_MARKER = '<!-- repoctl-auto-changeset -->'
const PACKAGE_PATH = /^packages\/([^/]+)\//
const CHANGESET_PATH = /^\.changeset\/[^/]+\.md$/
const RELEASE_BRANCH = /^(?:pnpm-release\/|release\/pnpm-version)/

export function packageDirectories(files) {
  return [...new Set(files
    .map(file => file.filename ?? file)
    .filter(filename => !/^packages\/[^/]+\/dist(?:\/|$)/.test(filename))
    .map(filename => filename.match(PACKAGE_PATH)?.[1])
    .filter(Boolean))]
}

export function releaseLevel(labels = []) {
  const names = labels.map(label => typeof label === 'string' ? label : label.name)
  if (names.includes('release:major')) {
    return 'major'
  }
  if (names.includes('release:minor')) {
    return 'minor'
  }
  return 'patch'
}

export function renderChangeset({ packages, level = 'patch', number, title }) {
  const frontmatter = packages
    .slice()
    .sort((a, b) => a.localeCompare(b))
    .map(name => `${/^[\w.-]+$/.test(name) ? name : JSON.stringify(name)}: ${level}`)
    .join('\n')
  const summary = title.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim()
  return `---\n${frontmatter}\n---\n\n${summary} (#${number})\n`
}

export function changesetPath(number) {
  return `.changeset/auto-pr-${number}.md`
}

export function isReleaseBranch(ref) {
  return RELEASE_BRANCH.test(ref)
}

export function hasChangeset(files) {
  return files.some(file => CHANGESET_PATH.test(file.filename ?? file))
}

function hasManualChangeset(files, generatedPath) {
  return files.some((file) => {
    const filename = file.filename ?? file
    return CHANGESET_PATH.test(filename) && filename !== generatedPath
  })
}

export function isPublishableManifest(manifest) {
  return Boolean(manifest && typeof manifest.name === 'string' && manifest.private !== true)
}

async function manifestsForFiles(client, files, ref) {
  const names = []
  for (const directory of packageDirectories(files)) {
    const content = await client.getContent(`packages/${directory}/package.json`, ref)
    if (!content) {
      continue
    }
    try {
      const manifest = JSON.parse(content)
      if (isPublishableManifest(manifest)) {
        names.push(manifest.name)
      }
    }
    catch {
      // Ignore a malformed manifest; the normal CI checks will report it.
    }
  }
  return [...new Set(names)]
}

async function commitChangesets(client, branch, baseSha, entries) {
  const commit = await client.getCommit(baseSha)
  const tree = []
  for (const entry of entries) {
    const blob = await client.createBlob(entry.content)
    tree.push({ path: entry.path, mode: '100644', type: 'blob', sha: blob.sha })
  }
  const nextTree = await client.createTree(commit.tree.sha, tree)
  const nextCommit = await client.createCommit('chore(release): add automated changesets', nextTree.sha, [baseSha])
  await client.updateRef(branch, nextCommit.sha)
  return nextCommit.sha
}

async function commentFork(client, number) {
  const comments = await client.listComments(number)
  if (comments.some(comment => comment.body?.includes(CHANGESET_MARKER))) {
    return false
  }
  await client.createComment(number, `${CHANGESET_MARKER}\nThis PR changes a publishable package. Please add a .changeset/*.md release intent before merging. You can run pnpm change locally.`)
  return true
}

async function prepareEntry(client, pullRequest, files) {
  const path = changesetPath(pullRequest.number)
  if (pullRequest.draft || isReleaseBranch(pullRequest.head.ref) || hasManualChangeset(files, path)) {
    return undefined
  }
  const packages = await manifestsForFiles(client, files, pullRequest.head.sha)
  if (!packages.length) {
    return undefined
  }
  const level = releaseLevel(pullRequest.labels)
  const content = renderChangeset({ packages, level, number: pullRequest.number, title: pullRequest.title })
  const existing = await client.getContent(path, pullRequest.head.sha)
  if (existing && !['patch', 'minor', 'major'].some(candidate => existing === renderChangeset({ packages, level: candidate, number: pullRequest.number, title: pullRequest.title }))) {
    return undefined
  }
  if (existing === content) {
    return undefined
  }
  return {
    path,
    content,
  }
}

export async function processPullRequest(client, number, { expectedHeadSha } = {}) {
  const pullRequest = await client.getPullRequest(number)
  if (expectedHeadSha && pullRequest.head.sha !== expectedHeadSha) {
    throw new Error('PR head changed before release intent preparation; approve the latest run.')
  }
  const files = await client.getPullRequestFiles(number)
  const entry = await prepareEntry(client, pullRequest, files)
  if (!entry) {
    return { action: 'skipped', number }
  }
  const repository = pullRequest.base.repo.full_name
  if (pullRequest.head.repo.full_name !== repository) {
    await commentFork(client, number)
    return { action: 'commented', number }
  }
  const ref = await client.getRef(`heads/${pullRequest.head.ref}`)
  if (ref.object.sha !== pullRequest.head.sha) {
    throw new Error('PR head changed while preparing its release intent; retry the latest run.')
  }
  const sha = await commitChangesets(client, pullRequest.head.ref, pullRequest.head.sha, [entry])
  return { action: 'committed', number, path: entry.path, sha }
}

export async function backfillPullRequests(client, numbers, { runId = `${Date.now()}` } = {}) {
  const baseRef = await client.getRef('heads/main')
  const entries = []
  const seen = new Set()
  const results = []
  for (const number of numbers) {
    const pullRequest = await client.getPullRequest(number)
    if (!pullRequest.merged_at || pullRequest.base.ref !== 'main') {
      results.push({ action: 'skipped', number })
      continue
    }
    const files = await client.getPullRequestFiles(number)
    const path = changesetPath(number)
    if (hasChangeset(files) || seen.has(path) || await client.getContent(path, baseRef.object.sha)) {
      results.push({ action: 'skipped', number })
      continue
    }
    const packages = await manifestsForFiles(client, files, pullRequest.merge_commit_sha)
    if (!packages.length) {
      results.push({ action: 'skipped', number })
      continue
    }
    seen.add(path)
    entries.push({
      path,
      content: renderChangeset({ packages, level: releaseLevel(pullRequest.labels), number, title: pullRequest.title }),
    })
    results.push({ action: 'planned', number, path })
  }
  if (!entries.length) {
    return { results, pullRequest: undefined }
  }
  const branch = `automation/changeset-backfill-${runId}`
  await client.createBranch(branch, baseRef.object.sha)
  await commitChangesets(client, branch, baseRef.object.sha, entries)
  const created = await client.createPullRequest({
    base: 'main',
    head: branch,
    title: `chore(release): backfill changesets (${numbers.map(number => `#${number}`).join(', ')})`,
    body: `This PR backfills automated release intents for merged PRs.\n\n${entries.map(entry => `- ${entry.path}`).join('\n')}`,
  })
  return { results, pullRequest: created }
}

async function main() {
  const eventPath = process.env.GITHUB_EVENT_PATH
  const event = eventPath ? JSON.parse(await fs.readFile(eventPath, 'utf8')) : undefined
  const repository = process.env.GITHUB_REPOSITORY ?? event?.repository?.full_name
  const token = process.env.GITHUB_TOKEN
  if (!repository || !token) {
    throw new Error('GITHUB_REPOSITORY and GITHUB_TOKEN are required')
  }
  const client = createGitHubClient({ token, repository })
  if (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
    const numbers = (process.env.PR_NUMBERS ?? '').split(',').map(value => Number(value.trim())).filter(value => Number.isInteger(value) && value > 0)
    if (!numbers.length) {
      throw new Error('PR_NUMBERS must contain at least one PR number')
    }
    console.log(JSON.stringify(await backfillPullRequests(client, numbers, { runId: process.env.GITHUB_RUN_ID })))
    return
  }
  const number = event?.pull_request?.number
  if (!number) {
    throw new Error('pull_request event payload is required')
  }
  console.log(JSON.stringify(await processPullRequest(client, number)))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.stack ?? error)
    process.exitCode = 1
  })
}
