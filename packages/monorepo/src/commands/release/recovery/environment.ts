import type { ReleaseOptions } from '../types'
import { lstat, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { ReleaseCommandError } from '../errors'
import { getReleaseEnv, run } from '../shared'

export async function assertRecoveryDirectory(directory: string) {
  const entry = await lstat(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') {
      throw error
    }
    return undefined
  })
  if (entry && !entry.isDirectory()) {
    throw new ReleaseCommandError('Recovery directory is invalid: expected a directory without a symlink')
  }
}

/** 从历史 checkout 解析 pnpm，供安装和嵌套生命周期脚本使用。 */
export async function sourcePackageManagerEnvironment(options: ReleaseOptions, root: string) {
  const directory = path.join(root, 'package-manager')
  await assertRecoveryDirectory(directory)
  await mkdir(directory, { recursive: true })
  run('corepack', ['enable', '--install-directory', directory, 'pnpm'], options)
  const env = { ...getReleaseEnv(options) }
  const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') ?? 'PATH'
  env[pathKey] = `${directory}${path.delimiter}${env[pathKey] ?? ''}`
  env['COREPACK_ENABLE_PROJECT_SPEC'] = '1'
  env['COREPACK_ENABLE_STRICT'] = '1'
  env['COREPACK_ENABLE_AUTO_PIN'] = '0'
  return env
}
