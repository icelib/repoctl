import type { Stats } from 'node:fs'
import type { CreateNewProjectPlan } from './plan'
import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, link, lstat, mkdir, mkdtemp, readdir, readlink, rename, rmdir, symlink, unlink, writeFile } from 'node:fs/promises'
import { scaffoldTemplate } from '@icebreakers/monorepo-templates'
import path from 'pathe'
import { clearWorkspaceCache } from '../../core/workspace'
import { setByPath } from '../../utils'
import fs from '../../utils/fs'
import { applyGitMetadata, sanitizeTemplatePackageJson } from './metadata'
import { cleanupStaleCreateStaging, removeCreateStaging, removeCreateTargetMarker, writeCreateStagingMarker, writeCreateTargetMarker } from './recovery'
import { writeCreateManifestRecovery } from './recovery/manifest'
import { rewriteTemplateRootReferences } from './references'
import { pathEntryExists, validateCreateSource, validateCreateTarget } from './validation'
import { prepareWorkspaceManifest, readOptionalManifest } from './workspace'

interface CreatedEntry {
  path: string
  stat: Stats
}

interface ManifestRollback {
  path: string
  original: string | null
  expected: string
  before: Stats | undefined
}

function sameIdentity(left: Stats, right: Stats) {
  return left.dev === right.dev && left.ino === right.ino
}

async function readOptionalStat(targetPath: string) {
  try {
    return await lstat(targetPath)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }
    throw error
  }
}

async function recordCreated(targetPath: string, created: CreatedEntry[]) {
  created.push({ path: targetPath, stat: await lstat(targetPath) })
}

async function createParents(targetDir: string, created: CreatedEntry[]) {
  const missing: string[] = []
  let current = path.dirname(targetDir)
  while (!await pathEntryExists(current)) {
    missing.unshift(current)
    current = path.dirname(current)
  }
  for (const directory of missing) {
    await mkdir(directory)
    await recordCreated(directory, created)
  }
}

async function publishFile(source: string, target: string, created: CreatedEntry[]) {
  // Copy beside the destination first, then install with an exclusive hard link.
  // This keeps a failed copy from exposing a partial destination and preserves a
  // concurrently created user file when the link reports EEXIST.
  const temporary = `${target}.repoctl-copy-${randomUUID()}`
  try {
    await copyFile(source, temporary, constants.COPYFILE_EXCL)
    await link(temporary, target)
    await recordCreated(target, created)
  }
  finally {
    await unlink(temporary).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    })
  }
}

async function publishDirectoryContents(source: string, target: string, created: CreatedEntry[]) {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name)
    const to = path.join(target, entry.name)
    if (entry.isDirectory()) {
      // Exclusive mkdir reserves the target; a concurrently created directory is never replaced.
      await mkdir(to)
      await recordCreated(to, created)
      await publishDirectoryContents(from, to, created)
    }
    else {
      if (entry.isSymbolicLink()) {
        await symlink(await readlink(from), to)
        await recordCreated(to, created)
      }
      else {
        await publishFile(from, to, created)
      }
    }
  }
}

async function rollbackCreated(created: CreatedEntry[]) {
  for (const entry of [...created].reverse()) {
    try {
      const current = await lstat(entry.path)
      if (current.dev !== entry.stat.dev || current.ino !== entry.stat.ino) {
        continue
      }
      if (current.isDirectory()) {
        // Only empty directories are removed. User additions survive rollback.
        await rmdir(entry.path)
      }
      else if (current.size === entry.stat.size && current.mtimeMs === entry.stat.mtimeMs) {
        await unlink(entry.path)
      }
    }
    catch (error) {
      if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes((error as NodeJS.ErrnoException).code ?? '')) {
        throw error
      }
    }
  }
}

/**
 * A rename/link can report an error after the directory entry has already been
 * installed (for example when a mocked or interrupted filesystem call loses
 * its reply).  In that case the target rollback above is not enough: the
 * workspace manifest must be restored too.  Only restore when the path still
 * contains the exact content produced by this operation and its identity is
 * different from the pre-commit entry.  A user edit made after the ambiguous
 * operation is therefore preserved.
 */
async function rollbackManifestMutation(mutation: ManifestRollback) {
  const current = await readOptionalStat(mutation.path)
  if (!current || current.isSymbolicLink()) {
    return
  }

  if (mutation.before && sameIdentity(current, mutation.before)) {
    return
  }

  if (await readOptionalManifest(mutation.path) !== mutation.expected) {
    return
  }

  if (mutation.original === null) {
    await unlink(mutation.path)
  }
  else {
    await writeFile(mutation.path, mutation.original, 'utf8')
  }
}

export async function executeCreatePlan(plan: CreateNewProjectPlan) {
  const packageJson = await validateCreateSource(plan.sourceDir)
  const manifest = await prepareWorkspaceManifest(plan.cwd, plan.targetName)
  await cleanupStaleCreateStaging(plan.cwd)
  const staging = await mkdtemp(path.join(plan.cwd, '.repoctl-create-'))
  const stagingIdentity = await readOptionalStat(staging)
  const stagedTarget = path.join(staging, 'project')
  const stagedManifest = path.join(staging, 'pnpm-workspace.yaml')
  const created: CreatedEntry[] = []
  let manifestRollback: ManifestRollback | undefined
  try {
    await writeCreateStagingMarker(staging, plan.cwd, plan.targetDir)
    await scaffoldTemplate({ sourceDir: plan.sourceDir, targetDir: stagedTarget, skipRootBasenames: ['package.json'] })
    await rewriteTemplateRootReferences(stagedTarget, plan.cwd, plan.targetDir)
    if (packageJson) {
      sanitizeTemplatePackageJson(packageJson)
      setByPath(packageJson, 'version', '0.0.0')
      setByPath(packageJson, 'name', plan.packageName)
      await applyGitMetadata(packageJson, plan.cwd, plan.targetDir)
      await fs.outputJson(path.join(stagedTarget, plan.packageJsonFileName), packageJson, { spaces: 2 })
    }
    if (manifest.plan.changed) {
      await writeFile(stagedManifest, manifest.content!, 'utf8')
    }
    // Persist the pre-image before publishing ownership metadata. A terminated
    // process cannot run catch/finally, so recovery must not depend on memory or
    // the staged manifest that rename consumes during commit.
    await writeCreateManifestRecovery(staging, {
      cwd: plan.cwd,
      targetDir: plan.targetDir,
      original: manifest.original,
      expected: manifest.content,
      changed: manifest.plan.changed,
      stagedManifest,
    })
    await validateCreateTarget(plan.cwd, plan.targetDir)
    await createParents(plan.targetDir, created)
    await mkdir(plan.targetDir)
    await recordCreated(plan.targetDir, created)
    await writeCreateTargetMarker(plan.targetDir, plan.cwd, staging)
    await recordCreated(path.join(plan.targetDir, '.repoctl-create-target.json'), created)
    await publishDirectoryContents(stagedTarget, plan.targetDir, created)
    if (await readOptionalManifest(manifest.plan.path) !== manifest.original) {
      throw new Error('pnpm-workspace.yaml changed during creation; retry with the updated workspace.')
    }
    if (manifest.plan.changed) {
      const before = await readOptionalStat(manifest.plan.path)
      manifestRollback = {
        path: manifest.plan.path,
        original: manifest.original,
        expected: manifest.content!,
        before,
      }
      if (manifest.original === null) {
        await link(stagedManifest, manifest.plan.path)
      }
      else {
        await rename(stagedManifest, manifest.plan.path)
      }
    }
    await removeCreateTargetMarker(plan.targetDir)
  }
  catch (error) {
    await rollbackCreated(created)
    if (manifestRollback) {
      await rollbackManifestMutation(manifestRollback)
    }
    throw error
  }
  finally {
    clearWorkspaceCache()
    await removeCreateStaging(staging, stagingIdentity)
  }
}
