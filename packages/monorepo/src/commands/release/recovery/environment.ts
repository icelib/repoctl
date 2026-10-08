import type { ReleaseOptions } from '../types'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { getReleaseEnv, run } from '../shared'

/** Resolve pnpm from the historical checkout for installs and nested lifecycle scripts. */
export async function sourcePackageManagerEnvironment(options: ReleaseOptions, root: string) {
  const directory = path.join(root, 'package-manager')
  await mkdir(directory)
  run('corepack', ['enable', '--install-directory', directory, 'pnpm'], options)
  const env = { ...getReleaseEnv(options) }
  const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') ?? 'PATH'
  env[pathKey] = `${directory}${path.delimiter}${env[pathKey] ?? ''}`
  env['COREPACK_ENABLE_PROJECT_SPEC'] = '1'
  env['COREPACK_ENABLE_STRICT'] = '1'
  env['COREPACK_ENABLE_AUTO_PIN'] = '0'
  return env
}
