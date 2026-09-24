import type { Dirent } from 'node:fs'
import fs from 'node:fs/promises'
import * as path from 'node:path'
import { assetTargets } from '../../assets-data.mjs'
import { templateChoices } from '../../template-data.mjs'
import { assetsDir, packageDir, templatesDir } from '../paths'
import { toPublishGitignorePath } from '../utils/gitignore'
import { shouldSkipTemplatePath } from '../utils/template-filter'
import { publishedToolingConfigs, removeSourceRepoReleaseToolingBuildStepContent, sanitizePublishedManifestContent, sanitizePublishedWorkspaceContent } from './published'

export { removeSourceRepoReleaseToolingBuildStepContent, sanitizePublishedWorkspaceContent } from './published'

const huskySkippedEntryPattern = /[\\/]_$/
// npm intentionally excludes files named `.npmrc` from published tarballs.
// Keep the managed config under a publishable name and restore the dotfile
// when it is copied into a generated workspace.
function toPublishedAssetPath(target: string) {
  return target === '.npmrc' ? 'npmrc' : toPublishGitignorePath(target)
}

export interface PrepareAssetsOptions {
  overwriteExisting?: boolean
  silent?: boolean
}

async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath)
    return true
  }
  catch {
    return false
  }
}

async function renameGitignoreFiles(targetDir: string) {
  let entries: Dirent[]
  try {
    entries = await fs.readdir(targetDir, { withFileTypes: true })
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return
    }
    throw error
  }
  await Promise.all(entries.map(async (entry) => {
    const current = path.join(targetDir, entry.name)
    if (entry.isDirectory()) {
      await renameGitignoreFiles(current)
      return
    }
    const renamed = toPublishGitignorePath(entry.name)
    if (renamed !== entry.name) {
      await fs.rename(current, path.join(targetDir, renamed))
    }
  }))
}

async function resetDir(targetDir: string, overwriteExisting: boolean) {
  if (!overwriteExisting && await pathExists(targetDir)) {
    return
  }
  try {
    await fs.rm(targetDir, { recursive: true, force: true })
  }
  catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err?.code !== 'ENOTEMPTY' && err?.code !== 'EBUSY' && err?.code !== 'EPERM') {
      throw error
    }
  }
  await fs.mkdir(targetDir, { recursive: true })
}

async function copyEntry(from: string, to: string, overwriteExisting: boolean, filter?: (src: string) => boolean) {
  if (!overwriteExisting && await pathExists(to)) {
    const [fromStats, toStats] = await Promise.all([fs.stat(from), fs.stat(to)])
    if (fromStats.isDirectory() && toStats.isDirectory()) {
      await fs.cp(from, to, {
        recursive: true,
        force: false,
        errorOnExist: false,
        filter,
      })
    }
    return
  }
  try {
    await fs.cp(from, to, {
      recursive: true,
      force: overwriteExisting,
      filter,
    })
  }
  catch (error) {
    const err = error as NodeJS.ErrnoException
    if (!overwriteExisting && (err?.code === 'EEXIST' || err?.code === 'ENOTEMPTY')) {
      return
    }
    throw error
  }
}

const publishedAgentSourceFiles = new Set(['AGENTS.md', 'CLAUDE.md'])

async function copyAssets(repoRoot: string, overwriteExisting: boolean) {
  const monorepoAssetRoot = path.resolve(repoRoot, 'packages/monorepo/assets')

  for (const target of assetTargets) {
    const packageAsset = path.join(monorepoAssetRoot, toPublishGitignorePath(target))
    const repoAsset = path.join(repoRoot, target)
    const from = publishedAgentSourceFiles.has(target) || !(await pathExists(repoAsset))
      ? packageAsset
      : repoAsset
    if (!await pathExists(from)) {
      continue
    }
    const to = path.join(assetsDir, toPublishedAssetPath(target))
    const stats = await fs.stat(from)
    const filter = target === '.husky'
      ? (src: string) => !huskySkippedEntryPattern.test(src)
      : undefined
    const refreshManagedMetadata = ['package.json', '.npmrc', 'pnpm-workspace.yaml', 'AGENTS.md', 'CLAUDE.md'].includes(target)
    await copyEntry(from, to, overwriteExisting || refreshManagedMetadata, filter)
    if (target === 'tsconfig.json') {
      await fs.writeFile(to, `${JSON.stringify({
        extends: 'repoctl/tsconfig.json',
        files: [],
      }, null, 2)}\n`)
    }
    if (stats.isDirectory()) {
      await renameGitignoreFiles(to)
    }
  }
}

async function writePublishedToolingConfigs() {
  await Promise.all(Object.entries(publishedToolingConfigs).map(async ([filename, content]) => {
    const targetPath = path.join(assetsDir, filename)
    if (await pathExists(targetPath)) {
      await fs.writeFile(targetPath, content)
    }
  }))
}

async function writePublishedAgentSkill(repoRoot: string) {
  const skillFrom = path.join(repoRoot, 'packages/monorepo/resources/skills/repoctl')
  if (!await pathExists(skillFrom)) {
    return
  }
  const skillTo = path.join(assetsDir, '.agents', 'skills', 'repoctl')
  await copyEntry(skillFrom, skillTo, true)
}

async function sanitizePublishedWorkspace() {
  const workspacePath = path.join(assetsDir, 'pnpm-workspace.yaml')
  if (!await pathExists(workspacePath)) {
    return
  }

  const content = await fs.readFile(workspacePath, 'utf8')
  await fs.writeFile(workspacePath, sanitizePublishedWorkspaceContent(content), 'utf8')
}

async function removePublishedReleaseState() {
  await fs.rm(path.join(assetsDir, '.changeset', 'ledger.yaml'), { force: true })
}

async function removeSourceRepoReleaseToolingBuildStep() {
  const releaseWorkflowPath = path.join(assetsDir, '.github/workflows/release.yml')
  if (!await pathExists(releaseWorkflowPath)) {
    return
  }

  const content = await fs.readFile(releaseWorkflowPath, 'utf8')
  const nextContent = removeSourceRepoReleaseToolingBuildStepContent(content)
  if (nextContent !== content) {
    await fs.writeFile(releaseWorkflowPath, nextContent, 'utf8')
  }
}

async function removeSourceRepoChecks() {
  const workflowPath = path.join(assetsDir, '.github/workflows/ci.yml')
  if (await pathExists(workflowPath)) {
    const workflow = await fs.readFile(workflowPath, 'utf8')
    await fs.writeFile(workflowPath, workflow.replace(/\r?\n\s+- name: Check Worker type generation from packaged templates\r?\n\s+run: pnpm test:worker-types\r?\n/g, '\n'))
  }
  const manifestPath = path.join(assetsDir, 'package.json')
  if (await pathExists(manifestPath)) {
    const content = await fs.readFile(manifestPath, 'utf8')
    await fs.writeFile(manifestPath, sanitizePublishedManifestContent(content))
  }
}

async function copyTemplates(repoRoot: string, overwriteExisting: boolean) {
  for (const template of templateChoices) {
    const from = path.join(repoRoot, 'templates', template.source)
    if (!await pathExists(from)) {
      continue
    }
    const to = path.join(templatesDir, template.source)
    const filter = (src: string) => !shouldSkipTemplatePath(from, src)
    await copyEntry(from, to, overwriteExisting, filter)
    await renameGitignoreFiles(to)
  }
}

export async function prepareAssets(options: PrepareAssetsOptions = {}) {
  const overwriteExisting = options.overwriteExisting ?? true
  const repoRoot = path.resolve(packageDir, '..', '..')
  if (!await pathExists(path.join(repoRoot, 'templates'))) {
    return
  }
  await resetDir(assetsDir, overwriteExisting)
  await resetDir(templatesDir, overwriteExisting)
  // Remove the old ignored filename when refreshing an existing local cache.
  await fs.rm(path.join(assetsDir, '.npmrc'), { force: true })
  await copyAssets(repoRoot, overwriteExisting)
  await sanitizePublishedWorkspace()
  await removePublishedReleaseState()
  await writePublishedToolingConfigs()
  await writePublishedAgentSkill(repoRoot)
  await removeSourceRepoReleaseToolingBuildStep()
  await removeSourceRepoChecks()
  await copyTemplates(repoRoot, overwriteExisting)
}
