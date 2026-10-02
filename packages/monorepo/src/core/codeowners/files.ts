import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, open, readFile, realpath, rename, rm } from 'node:fs/promises'
import path from 'node:path'

export const codeownersPaths = ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS']

export async function readOptional(file: string) {
  try {
    return await readFile(file, 'utf8')
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw error
  }
}

export function hashContent(content: string | null) {
  return content === null ? null : createHash('sha256').update(content).digest('hex')
}

export async function validateOwnersTarget(workspaceDir: string, file: string) {
  const root = await realpath(workspaceDir)
  const target = path.resolve(root, file)
  const relative = path.relative(root, target).replaceAll('\\', '/')
  if (!codeownersPaths.includes(relative)) {
    throw new Error('Explicitly select .github/CODEOWNERS, CODEOWNERS, or docs/CODEOWNERS inside the workspace.')
  }
  let current = root
  for (const part of relative.split('/')) {
    current = path.join(current, part)
    try {
      const stat = await lstat(current)
      if (stat.isSymbolicLink() || (current === target ? !stat.isFile() || stat.nlink !== 1 : !stat.isDirectory())) {
        throw new Error(`Refusing unsafe CODEOWNERS path: ${current}`)
      }
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  }
  return target
}

export async function replaceOwnersFile(workspaceDir: string, file: string, before: string | null, after: string) {
  const target = await validateOwnersTarget(workspaceDir, file)
  const parent = path.dirname(target)
  await mkdir(parent, { recursive: true })
  const temp = path.join(parent, `.repoctl-codeowners-${randomUUID()}.tmp`)
  try {
    const mode = before === null ? 0o644 : (await lstat(target)).mode
    const handle = await open(temp, 'wx', mode)
    try {
      await handle.writeFile(after, 'utf8')
      await handle.sync()
    }
    finally {
      await handle.close()
    }
    await validateOwnersTarget(workspaceDir, file)
    if (await readOptional(target) !== before) {
      throw new Error('CODEOWNERS changed after preview; regenerate the plan.')
    }
    await rename(temp, target)
  }
  finally {
    await rm(temp, { force: true })
  }
}
