import type { TemplateChoice } from './types'
import fs from 'node:fs/promises'
import path from 'node:path'
import { templateChoices } from '../template-data.mjs'
import { assetsDir as defaultAssetsDir, templatesDir as defaultTemplatesDir } from './paths'
import { ensureTemplateAssetsPrepared } from './runtime-assets'
import { toWorkspaceAssetPath, toWorkspaceGitignorePath } from './utils/gitignore'
import { shouldSkipTemplatePath } from './utils/template-filter'

type TargetMode = 'prepare' | 'ensure' | 'skip'

interface PrepareTargetOptions {
  force?: boolean
}

interface CopyDirContentsOptions {
  rootDir?: string
  filter?: (src: string) => boolean
  renameEntry?: (name: string) => string
  skipRootBasenames?: string[]
}

export interface ScaffoldTemplateOptions {
  sourceDir: string
  targetDir: string
  ensureTargetDir?: boolean
  filter?: (src: string) => boolean
  renameEntry?: (name: string) => string
  skipRootBasenames?: string[]
}

export interface ScaffoldWorkspaceOptions {
  targetDir: string
  templateKeys?: string[]
  assetsDir?: string
  templatesDir?: string
  includeAssets?: boolean
  targetMode?: TargetMode
  force?: boolean
}

async function isEmptyDir(dir: string) {
  try {
    const entries = await fs.readdir(dir)
    return entries.length === 0
  }
  catch (error) {
    if (error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return true
    }
    throw error
  }
}

async function prepareTargetDir(dir: string, options: PrepareTargetOptions = {}) {
  const empty = await isEmptyDir(dir)
  if (empty) {
    await fs.mkdir(dir, { recursive: true })
    return
  }
  if (!options.force) {
    throw new Error(`Target directory ${dir} is not empty. Pass --force to overwrite.`)
  }
  await fs.rm(dir, { recursive: true, force: true })
  await fs.mkdir(dir, { recursive: true })
}

async function copyDirContents(sourceDir: string, targetDir: string, options: CopyDirContentsOptions = {}) {
  const rootDir = options.rootDir ?? sourceDir
  const filter = options.filter ?? ((src: string) => !shouldSkipTemplatePath(rootDir, src))
  const renameEntry = options.renameEntry ?? toWorkspaceGitignorePath
  const skipRoot = new Set(options.skipRootBasenames ?? [])

  await fs.mkdir(targetDir, { recursive: true })
  const entries = await fs.readdir(sourceDir, { withFileTypes: true })
  for (const entry of entries) {
    if (sourceDir === rootDir && skipRoot.has(entry.name)) {
      continue
    }
    const from = path.join(sourceDir, entry.name)
    if (!filter(from)) {
      continue
    }
    const targetName = renameEntry(entry.name)
    const to = path.join(targetDir, targetName)
    if (entry.isDirectory()) {
      const nestedOptions: CopyDirContentsOptions = {
        rootDir,
        filter,
        renameEntry,
      }
      if (options.skipRootBasenames) {
        nestedOptions.skipRootBasenames = options.skipRootBasenames
      }
      await copyDirContents(from, to, {
        ...nestedOptions,
      })
      continue
    }
    if (entry.isSymbolicLink()) {
      const link = await fs.readlink(from)
      await fs.symlink(link, to)
      continue
    }
    await fs.cp(from, to)
  }
}

function isDefaultTemplatesPath(sourceDir: string) {
  const resolvedSource = path.resolve(sourceDir)
  const resolvedTemplatesRoot = path.resolve(defaultTemplatesDir)
  return resolvedSource === resolvedTemplatesRoot || resolvedSource.startsWith(`${resolvedTemplatesRoot}${path.sep}`)
}

export async function scaffoldTemplate(options: ScaffoldTemplateOptions) {
  const {
    sourceDir,
    targetDir,
    ensureTargetDir = true,
    filter,
    renameEntry,
    skipRootBasenames,
  } = options

  if (isDefaultTemplatesPath(sourceDir)) {
    await ensureTemplateAssetsPrepared()
  }

  if (ensureTargetDir) {
    await fs.mkdir(targetDir, { recursive: true })
  }

  const copyOptions: CopyDirContentsOptions = {
    rootDir: sourceDir,
  }
  if (filter) {
    copyOptions.filter = filter
  }
  if (renameEntry) {
    copyOptions.renameEntry = renameEntry
  }
  if (skipRootBasenames) {
    copyOptions.skipRootBasenames = skipRootBasenames
  }

  await copyDirContents(sourceDir, targetDir, copyOptions)
}

export async function scaffoldWorkspace(options: ScaffoldWorkspaceOptions) {
  const {
    targetDir,
    templateKeys = [],
    assetsDir = defaultAssetsDir,
    templatesDir = defaultTemplatesDir,
    includeAssets = true,
    targetMode = 'prepare',
    force = false,
  } = options

  if (
    (includeAssets && path.resolve(assetsDir) === path.resolve(defaultAssetsDir))
    || (templateKeys.length > 0 && path.resolve(templatesDir) === path.resolve(defaultTemplatesDir))
  ) {
    await ensureTemplateAssetsPrepared()
  }

  if (targetMode === 'prepare') {
    await prepareTargetDir(targetDir, { force })
  }
  else if (targetMode === 'ensure') {
    await fs.mkdir(targetDir, { recursive: true })
  }

  if (includeAssets) {
    await copyDirContents(assetsDir, targetDir, {
      rootDir: assetsDir,
      renameEntry: toWorkspaceAssetPath,
    })
  }

  if (!templateKeys.length) {
    return
  }

  const selections = new Set(templateKeys)
  for (const template of templateChoices as TemplateChoice[]) {
    if (!selections.has(template.key)) {
      continue
    }
    const from = path.join(templatesDir, template.source)
    const to = path.join(targetDir, template.target)
    await scaffoldTemplate({ sourceDir: from, targetDir: to })
  }
}

export type { TargetMode }
