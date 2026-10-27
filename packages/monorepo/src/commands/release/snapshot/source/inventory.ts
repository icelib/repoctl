import { createHash } from 'node:crypto'
import { lstat, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

export interface SourceFile {
  sha256: string
  mode: number
}

/** 安装依赖不属于归档源码；其余原有文件和所有新增产物均逐字节检查。 */
export async function sourceInventory(directory: string): Promise<Map<string, SourceFile>> {
  const files = new Map<string, SourceFile>()
  const visit = async (root: string, parts: string[]) => {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (entry.name === 'node_modules') {
        continue
      }
      const relative = [...parts, entry.name]
      const target = path.join(root, entry.name)
      const stat = await lstat(target)
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile()) || entry.name.toLowerCase() === '.git') {
        throw new Error(`Snapshot source preparation cannot create links, Git metadata or special files: ${relative.join('/')}`)
      }
      if (stat.isDirectory()) {
        await visit(target, relative)
      }
      else {
        files.set(relative.join('/'), { sha256: createHash('sha256').update(await readFile(target)).digest('hex'), mode: stat.mode & 0o777 })
      }
    }
  }
  await visit(directory, [])
  return files
}
