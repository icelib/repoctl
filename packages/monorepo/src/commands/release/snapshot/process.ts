import type { SnapshotOptions } from './types'
import process from 'node:process'
import crossSpawn from 'cross-spawn'

export function isolatedSnapshotEnvironment(options: Pick<SnapshotOptions, 'env'>, directory: string) {
  const env = { ...(options.env ?? process.env) }
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) {
    delete env[name]
  }
  env['GIT_CEILING_DIRECTORIES'] = directory
  return env
}

export function snapshotCommand(command: string, args: string[], options: Pick<SnapshotOptions, 'cwd' | 'env' | 'spawn'>) {
  const result = (options.spawn ?? crossSpawn.sync)(command, args, {
    cwd: options.cwd,
    env: { ...(options.env ?? process.env), COREPACK_ENABLE_AUTO_PIN: '0', COREPACK_ENABLE_NETWORK: '0', NO_COLOR: '1', FORCE_COLOR: '0' },
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 600_000,
    maxBuffer: 16 * 1024 * 1024,
  })
  if (result.error || result.status !== 0) {
    throw new Error(`Snapshot ${command} ${args.join(' ')} failed: ${result.error?.message ?? result.stderr?.toString().trim() ?? result.status}`)
  }
  return result.stdout?.toString().trim() ?? ''
}

export const isolatedPnpmOptions = ['--config.manage-package-manager-versions=false', '--config.pm-on-fail=ignore', '--config.runtime-on-fail=ignore']
