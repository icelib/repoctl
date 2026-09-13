import type { spawnSync } from 'node:child_process'
import type { ReleaseCommandConfig } from '../../types/config'
import type { GitHubOperations } from './github'

export const prereleaseBranches = new Set(['alpha', 'beta', 'rc', 'next'])

export type ReleaseMode = 'auto' | 'prepare' | 'publish' | 'publish-unpublished' | 'reconcile'

export interface ReleaseOptions {
  cwd: string
  branch?: string
  spawn?: typeof spawnSync
  env?: NodeJS.ProcessEnv
  config?: ReleaseCommandConfig
  /** 发布重试等待器，主要用于测试注入。 */
  sleep?: (milliseconds: number) => Promise<void>
}

export interface ReleaseCiOptions extends ReleaseOptions {
  mode?: ReleaseMode
  packageName?: string
  packageVersion?: string
  dryRun?: boolean
  github?: GitHubOperations
}

export interface PublishedPackage {
  name: string
  version: string
}
