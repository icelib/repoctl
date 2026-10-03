import { createHash } from 'node:crypto'
import { lstat, readFile } from 'node:fs/promises'
import { checkedFile } from '../../../core/file-transaction/paths'

export const hash = (content: string | Uint8Array) => createHash('sha256').update(content).digest('hex')

export async function readOptional(root: string, relative: string) {
  const filename = await checkedFile(root, relative)
  try {
    if ((await lstat(filename)).size > 1024 * 1024) {
      throw new Error(`Dev Container input exceeds 1 MiB: ${relative}`)
    }
    return await readFile(filename)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw error
  }
}

export async function assertInputs(root: string, inputs: Array<{ path: string, hash: string | null }>) {
  for (const input of inputs) {
    const content = await readOptional(root, input.path)
    if ((content === null ? null : hash(content)) !== input.hash) {
      throw new Error(`Dev Container input changed: ${input.path}`)
    }
  }
}
