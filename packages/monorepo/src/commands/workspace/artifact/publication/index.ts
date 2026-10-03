import type { ArtifactFile, WorkspaceArtifactPlan } from '../../../../types/artifact'
import type { OwnedOutput } from './state'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, mkdir, stat, symlink } from 'node:fs/promises'
import process from 'node:process'
import { isDeepStrictEqual } from 'node:util'
import path from 'pathe'
import { destination } from '../paths'
import { previousArtifact, receipt, receiptName } from '../receipt'
import { inventory } from '../tree'
import { writeOwnedFile } from './files'
import { checkParents, rollbackOutput, sameIdentity } from './state'

/** Publish exclusively, commit the receipt last, and never roll back another writer's files. */
export async function publishArtifact(plan: WorkspaceArtifactPlan, staging: string, files: ArtifactFile[], excluded: string[], verify: () => Promise<void>) {
  const current = await destination(plan.workspaceDir, plan.selection.output)
  if (!current.empty) {
    throw new Error('Artifact output became nonempty before publication.')
  }
  const root = current.output
  let createdRoot = false
  if (!current.stat) {
    await mkdir(root)
    createdRoot = true
  }
  const rootIdentity = await lstat(root)
  if (current.stat && !sameIdentity(current.stat, rootIdentity)) {
    throw new Error('Artifact output directory was replaced before publication.')
  }
  const directories = new Map([[root, rootIdentity]])
  const owned: OwnedOutput[] = []
  try {
    for (const file of files) {
      const filename = path.join(root, file.path)
      await checkParents(root, filename, directories)
      if (file.kind === 'directory') {
        await mkdir(filename, { mode: file.mode })
      }
      else if (file.kind === 'link') {
        const directoryLink = (await stat(path.resolve(path.dirname(path.join(staging, file.path)), file.link!))).isDirectory()
        const target = process.platform === 'win32' && directoryLink ? path.resolve(path.dirname(filename), file.link!) : file.link!
        await symlink(target, filename, directoryLink ? process.platform === 'win32' ? 'junction' : 'dir' : 'file')
      }
      else {
        await writeOwnedFile(filename, createReadStream(path.join(staging, file.path)), file, owned)
        continue
      }
      const identity = await lstat(filename)
      owned.push({ filename, identity, file })
      if (file.kind === 'directory') {
        directories.set(filename, identity)
      }
    }
    await verify()
    if (!isDeepStrictEqual((await inventory(root)).files, files)) {
      throw new Error('Artifact output changed during publication.')
    }
    const text = receipt(plan, files, excluded)
    const filename = path.join(root, receiptName)
    await checkParents(root, filename, directories)
    await writeOwnedFile(filename, [Buffer.from(text)], { path: receiptName, kind: 'file', mode: 0o644, size: Buffer.byteLength(text), hash: createHash('sha256').update(text).digest('hex'), link: null }, owned)
    await verify()
    await previousArtifact(plan)
  }
  catch (error) {
    const retained = await rollbackOutput(root, owned, directories, createdRoot)
    if (retained.length) {
      throw new AggregateError([error], `Artifact preparation failed; preserve concurrent files and review retained paths: ${retained.join(', ')}`)
    }
    throw error
  }
}
