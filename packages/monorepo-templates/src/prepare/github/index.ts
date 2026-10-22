import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { sanitizePublishedCiWorkflowContent } from '../workflows'
import { sanitizePublishedReleaseWorkflowContent } from './release'

const consumerWorkflowNames = ['ci.yml', 'release-intent-auto.yml', 'release-intent-check.yml']
const sourceOnlyGithubPaths = ['pr-ci', 'nightly', 'workflows/pr-ci.yml', 'workflows/pr-ci-manual.yml', 'workflows/devcontainer.yml']

function isPublishedSourcePath(sourceRoot: string, source: string) {
  const relative = path.relative(sourceRoot, source).split(path.sep).join('/')
  if (sourceOnlyGithubPaths.some(entry => relative === entry || relative.startsWith(`${entry}/`))) {
    return false
  }
  // Consumer CI owns its triggers independently of this source repository.
  return !relative.startsWith('workflows/') || relative === 'workflows/release.yml'
}

function consumerWorkflowContent(filename: string, content: string) {
  if (filename === 'release.yml') {
    return sanitizePublishedReleaseWorkflowContent(content)
  }
  return filename === 'ci.yml' ? sanitizePublishedCiWorkflowContent(content) : content
}

function workflowSource(repoRoot: string, filename: string) {
  return filename === 'release.yml'
    ? path.join(repoRoot, '.github/workflows', filename)
    : path.join(repoRoot, 'packages/monorepo/assets/.github/workflows', filename)
}

/** Publish consumer workflows while sharing release automation and GitHub metadata. */
export async function preparePublishedGithubAssets(repoRoot: string, assetRoot: string, overwriteExisting: boolean) {
  const sourceRoot = path.join(repoRoot, '.github')
  const targetRoot = path.join(assetRoot, '.github')

  try {
    await cp(sourceRoot, targetRoot, {
      recursive: true,
      force: overwriteExisting,
      errorOnExist: false,
      filter: source => isPublishedSourcePath(sourceRoot, source),
    })
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }

  // Also repair old local caches prepared from source-repository workflows.
  await Promise.all(sourceOnlyGithubPaths.map(entry => rm(path.join(targetRoot, entry), { force: true, recursive: true })))
  await mkdir(path.join(targetRoot, 'workflows'), { recursive: true })
  await Promise.all([...consumerWorkflowNames, 'release.yml'].map(async (filename) => {
    const content = await readFile(workflowSource(repoRoot, filename), 'utf8')
    await writeFile(path.join(targetRoot, 'workflows', filename), consumerWorkflowContent(filename, content))
  }))
}

export async function arePublishedGithubAssetsPrepared(repoRoot: string, assetRoot: string) {
  const targetRoot = path.join(assetRoot, '.github')
  try {
    const results = await Promise.all([...consumerWorkflowNames, 'release.yml'].map(async (filename) => {
      const [source, prepared] = await Promise.all([
        readFile(workflowSource(repoRoot, filename), 'utf8'),
        readFile(path.join(targetRoot, 'workflows', filename), 'utf8'),
      ])
      return consumerWorkflowContent(filename, source) === prepared
    }))
    for (const entry of sourceOnlyGithubPaths) {
      try {
        await access(path.join(targetRoot, entry))
        return false
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error
        }
      }
    }
    return results.every(Boolean)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false
    }
    throw error
  }
}
