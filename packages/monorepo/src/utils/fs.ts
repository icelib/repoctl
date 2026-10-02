import { randomUUID } from 'node:crypto'
import { access, chmod, cp, mkdir, mkdtemp, open, readdir, readFile, rename, rm, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'pathe'

/**
 * JSON 输出选项。
 */
export interface JsonWriteOptions {
  /**
   * `JSON.stringify` 缩进空格数。
   * @default undefined
   */
  spaces?: number
}

function stringifyJson(data: unknown, options?: JsonWriteOptions) {
  const content = JSON.stringify(data, undefined, options?.spaces)
  return options?.spaces ? `${content}\n` : content
}

async function ensureParentDir(targetPath: string) {
  await mkdir(path.dirname(targetPath), { recursive: true })
}

/**
 * 判断文件或目录是否存在。
 *
 * @param targetPath 目标路径
 * @returns 存在时返回 `true`
 */
export async function pathExists(targetPath: string) {
  try {
    await access(targetPath)
    return true
  }
  catch {
    return false
  }
}

/**
 * `pathExists()` 的别名。
 */
export const exists = pathExists

/**
 * 递归创建目录。
 */
export async function ensureDir(targetPath: string) {
  await mkdir(targetPath, { recursive: true })
}

/**
 * 确保文件存在；若父目录不存在会自动创建。
 */
export async function ensureFile(targetPath: string) {
  await ensureParentDir(targetPath)
  const handle = await open(targetPath, 'a')
  await handle.close()
}

/**
 * 递归删除文件或目录。
 *
 * 默认启用 `force: true`、`recursive: true`，并带少量重试。
 */
export async function remove(targetPath: string) {
  await rm(targetPath, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 100,
  })
}

/**
 * 递归复制文件或目录。
 */
export async function copy(sourcePath: string, targetPath: string) {
  await cp(sourcePath, targetPath, {
    recursive: true,
    force: true,
  })
}

/**
 * 自动创建父目录后写入文件。
 */
export async function outputFile(targetPath: string, data: Parameters<typeof writeFile>[1], options?: Parameters<typeof writeFile>[2]) {
  await ensureParentDir(targetPath)
  await writeFile(targetPath, data, options)
}

/**
 * Write a file by first creating a sibling temporary file and then replacing
 * the destination with a single rename.  Upgrade uses this helper so a
 * process termination or a failed write cannot leave a truncated managed
 * file at the destination.
 */
async function outputFileAtomic(targetPath: string, data: Parameters<typeof writeFile>[1], options?: Parameters<typeof writeFile>[2]) {
  await ensureParentDir(targetPath)
  const temporaryPath = `${targetPath}.repoctl-${randomUUID()}.tmp`
  try {
    await writeFile(temporaryPath, data, options)
    // `writeFile` only applies mode when it creates a file.  Callers that pass
    // an existing file's mode therefore get the same permissions after the
    // temporary file is renamed into place.
    if (typeof options === 'object' && options !== null && 'mode' in options && options.mode !== undefined) {
      await chmod(temporaryPath, options.mode)
    }
    await rename(temporaryPath, targetPath)
  }
  catch (error) {
    await unlink(temporaryPath).catch(() => {})
    throw error
  }
}

/**
 * 读取 JSON 文件并解析。
 */
export async function readJson<T = any>(targetPath: string) {
  return JSON.parse(await readFile(targetPath, 'utf8')) as T
}

/**
 * `readJson()` 的别名。
 */
export const readJSON = readJson

/**
 * 写入 JSON 文件，不会自动创建父目录。
 */
export async function writeJson(targetPath: string, data: unknown, options?: JsonWriteOptions) {
  await writeFile(targetPath, stringifyJson(data, options), 'utf8')
}

/**
 * `writeJson()` 的别名。
 */
export const writeJSON = writeJson

/**
 * 自动创建父目录后写入 JSON 文件。
 */
export async function outputJson(targetPath: string, data: unknown, options?: JsonWriteOptions) {
  await ensureParentDir(targetPath)
  await writeJson(targetPath, data, options)
}

/**
 * `outputJson()` 的别名。
 */
export const outputJSON = outputJson

/**
 * 判断是否为可忽略的文件系统错误。
 * - ENOENT: 文件已被删除
 * - EBUSY: Windows 中资源被系统占用
 */
export function isIgnorableFsError(error: unknown): error is NodeJS.ErrnoException {
  if (!error) {
    return false
  }
  const code = (error as NodeJS.ErrnoException).code
  return code === 'ENOENT' || code === 'EBUSY' || code === 'EEXIST'
}

const fs = {
  copy,
  ensureDir,
  ensureFile,
  exists,
  mkdtemp,
  outputFile,
  outputFileAtomic,
  outputJSON,
  outputJson,
  pathExists,
  readFile,
  readdir,
  readJSON,
  readJson,
  remove,
  stat,
  writeFile,
  writeJSON,
  writeJson,
} as const

export default fs
