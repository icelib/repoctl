import type { ReleaseOptions } from './types'
import { readFile } from 'node:fs/promises'
import { readPendingIntents } from './intents'
import { capture, getReleaseEnv } from './shared'

const releaseBranches = new Set(['main', 'alpha', 'beta', 'rc', 'next'])
const prereleaseBranches = new Set(['alpha', 'beta', 'rc', 'next'])

export interface ReleaseTriggerContext {
  eventName: string
  branch: string
  pendingChangesetFiles: readonly string[]
  changedFiles: readonly string[]
  commitMessage?: string
}

function normalizePath(file: string) {
  return file.replaceAll('\\', '/').replace(/^\.\//, '')
}

export function hasPendingChangeset(files: readonly string[]) {
  return files.some((file) => {
    const normalized = normalizePath(file)
    return normalized.startsWith('.changeset/')
      && normalized.endsWith('.md')
      && !normalized.endsWith('/README.md')
  })
}

export function isReleaseCommitMessage(message = '') {
  const subject = message.trim().split(/\r?\n/, 1)[0] ?? ''
  return /^chore\(release\):\s*.+/i.test(subject)
    || /^version packages(?:\s|$)/i.test(subject)
}

export function hasReleaseArtifactPair(files: readonly string[]) {
  const artifactsByDirectory = new Map<string, Set<string>>()

  for (const file of files) {
    const normalized = normalizePath(file)
    const slashIndex = normalized.lastIndexOf('/')
    if (slashIndex < 1) {
      continue
    }

    const directory = normalized.slice(0, slashIndex)
    const basename = normalized.slice(slashIndex + 1)
    if (basename !== 'package.json' && basename !== 'CHANGELOG.md') {
      continue
    }

    const artifacts = artifactsByDirectory.get(directory) ?? new Set<string>()
    artifacts.add(basename)
    artifactsByDirectory.set(directory, artifacts)
  }

  return [...artifactsByDirectory.values()].some(artifacts =>
    artifacts.has('package.json') && artifacts.has('CHANGELOG.md'))
}

export function shouldRunRelease(context: ReleaseTriggerContext) {
  if (context.eventName === 'workflow_dispatch') {
    return true
  }

  if (context.eventName !== 'push' || !releaseBranches.has(context.branch)) {
    return false
  }

  if (hasPendingChangeset(context.pendingChangesetFiles)) {
    return true
  }

  if (prereleaseBranches.has(context.branch)) {
    return false
  }

  return isReleaseCommitMessage(context.commitMessage)
    || hasReleaseArtifactPair(context.changedFiles)
}

function readGitOutput(options: ReleaseOptions, args: string[]) {
  try {
    return capture('git', args, options)
  }
  catch {
    return ''
  }
}

async function readChangedFiles(options: ReleaseOptions) {
  const env = getReleaseEnv(options)
  let diffRange: string[] = []
  const eventPath = env['GITHUB_EVENT_NAME'] === 'push' ? env['GITHUB_EVENT_PATH'] : undefined

  if (eventPath) {
    try {
      const event = JSON.parse(await readFile(eventPath, 'utf8')) as { before?: string, after?: string }
      if (event.before && event.after && !/^0+$/.test(event.before)) {
        diffRange = [event.before, event.after]
      }
    }
    catch {
      // Fall back to the latest commit when event metadata is unavailable.
    }
  }

  const args = diffRange.length > 0
    ? ['diff', '--name-only', ...diffRange]
    : ['diff', '--name-only', 'HEAD^', 'HEAD']
  const output = readGitOutput(options, args)
  return output ? output.split(/\r?\n/).filter(Boolean) : []
}

export async function readReleaseTriggerContext(options: ReleaseOptions): Promise<ReleaseTriggerContext> {
  const env = getReleaseEnv(options)
  const eventName = env['GITHUB_EVENT_NAME']?.trim() || 'push'
  const branch = options.branch?.trim() || env['GITHUB_REF_NAME']?.trim() || ''
  const sha = env['GITHUB_SHA']?.trim() || 'HEAD'

  return {
    eventName,
    branch,
    pendingChangesetFiles: await readPendingIntents(options.cwd),
    changedFiles: await readChangedFiles(options),
    commitMessage: readGitOutput(options, ['log', '-1', '--format=%s', sha]),
  }
}
