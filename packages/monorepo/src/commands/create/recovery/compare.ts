import type { Stats } from 'node:fs'
import { Buffer } from 'node:buffer'
import { lstat, readdir, readFile, readlink, rmdir, unlink } from 'node:fs/promises'
import path from 'pathe'

export interface RecoveryContext {
  targetDir: string
  stagedTarget: string
  targetIdentity: Pick<Stats, 'dev' | 'ino'>
  stagingDir: string
  stagingIdentity: Pick<Stats, 'dev' | 'ino'>
  dryRun: boolean
  removed: string[]
  preserved: string[]
  rootChanged: boolean
  stagingChanged: boolean
}

export async function readStat(entry: string) {
  try {
    return await lstat(entry)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }
    throw error
  }
}

async function sameLeaf(source: string, target: string, sourceStat: Awaited<ReturnType<typeof lstat>>, targetStat: Awaited<ReturnType<typeof lstat>>) {
  if (sourceStat.isSymbolicLink() || targetStat.isSymbolicLink()) {
    return sourceStat.isSymbolicLink() && targetStat.isSymbolicLink() && await readlink(source) === await readlink(target)
  }
  if (!sourceStat.isFile() || !targetStat.isFile()) {
    return false
  }
  return Buffer.compare(await readFile(source), await readFile(target)) === 0
}

async function removeLeaf(target: string, expected: Awaited<ReturnType<typeof lstat>>) {
  const current = await readStat(target)
  if (!current || current.dev !== expected.dev || current.ino !== expected.ino
    || (!current.isDirectory() && (current.mtimeMs !== expected.mtimeMs || current.size !== expected.size))) {
    return false
  }
  try {
    if (current.isDirectory() && !current.isSymbolicLink()) {
      await rmdir(target)
    }
    else {
      await unlink(target)
    }
    return true
  }
  catch (error) {
    if (['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes((error as NodeJS.ErrnoException).code ?? '')) {
      return false
    }
    throw error
  }
}

export async function ensureTargetIdentity(context: RecoveryContext) {
  const current = await readStat(context.targetDir)
  if (!current || !current.isDirectory() || current.isSymbolicLink()
    || current.dev !== context.targetIdentity.dev || current.ino !== context.targetIdentity.ino) {
    context.rootChanged = true
    return false
  }
  return true
}

export async function ensureStagingIdentity(context: RecoveryContext) {
  const current = await readStat(context.stagingDir)
  if (!current || !current.isDirectory() || current.isSymbolicLink()
    || current.dev !== context.stagingIdentity.dev || current.ino !== context.stagingIdentity.ino) {
    context.stagingChanged = true
    return false
  }
  return true
}

export async function readTargetEntries(context: RecoveryContext) {
  if (!await ensureTargetIdentity(context)) {
    return undefined
  }
  const entries = await readdir(context.targetDir)
  if (!await ensureTargetIdentity(context)) {
    return undefined
  }
  return entries
}

export async function inspectGeneratedEntry(source: string, target: string, relative: string, context: RecoveryContext): Promise<void> {
  if (!await ensureTargetIdentity(context) || !await ensureStagingIdentity(context)) {
    return
  }
  const [sourceStat, targetStat] = await Promise.all([readStat(source), readStat(target)])
  if (!targetStat) {
    return
  }
  if (!sourceStat) {
    context.preserved.push(relative)
    return
  }

  if (sourceStat.isDirectory() && !sourceStat.isSymbolicLink() && targetStat.isDirectory() && !targetStat.isSymbolicLink()) {
    for (const entry of await readdir(target)) {
      if (context.rootChanged) {
        return
      }
      await inspectGeneratedEntry(path.join(source, entry), path.join(target, entry), `${relative}/${entry}`, context)
    }
    const remaining = await readdir(target)
    if (remaining.length === 0) {
      if (context.dryRun) {
        context.removed.push(relative)
      }
      else if (await ensureTargetIdentity(context) && await ensureStagingIdentity(context) && await removeLeaf(target, targetStat)) {
        context.removed.push(relative)
      }
      else {
        context.preserved.push(relative)
      }
    }
    return
  }

  if (await sameLeaf(source, target, sourceStat, targetStat)) {
    if (context.dryRun) {
      context.removed.push(relative)
    }
    else if (await ensureTargetIdentity(context) && await ensureStagingIdentity(context) && await removeLeaf(target, targetStat)) {
      context.removed.push(relative)
    }
    else {
      context.preserved.push(relative)
    }
    return
  }
  context.preserved.push(relative)
}
