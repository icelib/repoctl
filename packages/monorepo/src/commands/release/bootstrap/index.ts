import type { ReleaseBootstrapStage } from '../types'
import type { BootstrapOptions, BootstrapReport } from './types'
import assert from 'node:assert/strict'
import { createBootstrapPlan } from './plan'
import { prepareBootstrap } from './prepare'
import { publishBootstrap } from './publication'
import { verifyBootstrapPublication } from './recovery'

export { createBootstrapPlan } from './plan'
export { prepareBootstrap } from './prepare'
export { publishBootstrap } from './publication'
export { verifyBootstrapPublication } from './recovery'
export type { BootstrapConsumerReport, BootstrapManifest, BootstrapOptions, BootstrapPackage, BootstrapPlan, BootstrapReport, BootstrapSource, PrepareBootstrapOptions } from './types'

/** 默认只准备；实际上传与只读恢复必须显式选择独立工作流阶段。 */
export async function releaseBootstrap(options: BootstrapOptions & { stage?: ReleaseBootstrapStage }): Promise<BootstrapReport> {
  const stage = options.verifyRunId ? 'verify' : options.stage ?? 'prepare'
  assert.ok(['prepare', 'publish', 'verify'].includes(stage), 'Unknown bootstrap stage')
  assert.ok(!options.dryRun || stage === 'prepare', 'Bootstrap dry-run only supports preparation')
  if (stage === 'publish') {
    return publishBootstrap(options)
  }
  if (stage === 'verify') {
    return verifyBootstrapPublication(options)
  }
  const plan = await createBootstrapPlan(options)
  return prepareBootstrap({ ...options, plan })
}
