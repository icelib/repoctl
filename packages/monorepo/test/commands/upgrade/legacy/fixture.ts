import { realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'pathe'
import fs from '@/utils/fs'

export async function createTempOutDir(slug: string) {
  const root = path.resolve(await realpath(await fs.mkdtemp(path.join(tmpdir(), slug))))
  const outDir = path.join(root, 'workspace')
  await fs.ensureDir(outDir)
  return { root, outDir }
}
