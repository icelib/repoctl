import type { UpgradeOperation } from './state'
import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import { safeInstancePath } from '@icebreakers/monorepo-templates'
import { readUpgradeFileState, stateMatches } from './state'

const temporaryPath = (operation: UpgradeOperation, token: string) => `${operation.path}.repoctl-template-${token}.tmp`

async function removeTemporary(root: string, operation: UpgradeOperation, token: string) {
  const relative = temporaryPath(operation, token)
  const current = await readUpgradeFileState(root, relative)
  if (!current) {
    return
  }
  if (!stateMatches(current, operation.after)) {
    throw new Error(`Unexpected contents in template transaction temporary file: ${relative}`)
  }
  await fs.unlink(await safeInstancePath(root, relative))
}

export async function applyUpgradeOperation(root: string, operation: UpgradeOperation, token: string) {
  const target = await safeInstancePath(root, operation.path)
  if (!stateMatches(await readUpgradeFileState(root, operation.path), operation.before)) {
    throw new Error(`Concurrent template instance change: ${operation.path}`)
  }
  if (operation.after?.entry.kind === 'directory') {
    if (operation.before) {
      throw new Error(`Directory replacement is not automatic: ${operation.path}`)
    }
    await fs.mkdir(target, { mode: operation.after.mode })
    return
  }
  if (!operation.after) {
    if (operation.before?.entry.kind === 'directory') {
      await fs.rmdir(target)
    }
    else {
      await fs.unlink(target)
    }
    return
  }
  const temporary = await safeInstancePath(root, temporaryPath(operation, token))
  await fs.writeFile(temporary, Buffer.from(operation.after.entry.content, 'base64'), { flag: 'wx', mode: operation.after.mode })
  await fs.chmod(temporary, operation.after.mode)
  if (!stateMatches(await readUpgradeFileState(root, operation.path), operation.before)) {
    throw new Error(`Concurrent template instance change: ${operation.path}`)
  }
  if (operation.before === null) {
    await fs.link(temporary, target)
    await fs.unlink(temporary)
  }
  else {
    await fs.rename(temporary, target)
  }
  await fs.utimes(target, operation.after.atimeMs / 1000, operation.after.mtimeMs / 1000)
}

export async function restoreUpgradeOperations(root: string, operations: UpgradeOperation[], token: string) {
  const failures: string[] = []
  for (const operation of [...operations].reverse()) {
    try {
      await removeTemporary(root, operation, token)
      const inverse = { ...operation, before: operation.after, after: operation.before }
      await removeTemporary(root, inverse, `${token}-restore`)
      const current = await readUpgradeFileState(root, operation.path)
      if (stateMatches(current, operation.before)) {
        continue
      }
      if (!stateMatches(current, operation.after)) {
        throw new Error('Concurrent business edit must be preserved')
      }
      await applyUpgradeOperation(root, inverse, `${token}-restore`)
    }
    catch {
      failures.push(operation.path)
    }
  }
  if (failures.length) {
    throw new Error(`Template file recovery is incomplete; preserve concurrent changes and the recovery record. Inspect: ${failures.join(', ')}`)
  }
}
