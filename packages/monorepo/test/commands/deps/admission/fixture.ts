import type { DependencyAdmissionConfig, DependencyAdmissionRule } from '@icebreakers/monorepo'
import { writeFile } from 'node:fs/promises'
import path from 'pathe'

export { fixture, runCli, snapshot, writeJson } from '../fixture'

export function rule(overrides: Partial<DependencyAdmissionRule> = {}): DependencyAdmissionRule {
  return { id: 'browser', workspaces: ['packages/web'], dependencies: ['legacy-sdk'], effect: 'deny', sections: ['dependencies'], reason: 'Use the maintained SDK', alternative: 'modern-sdk', ...overrides }
}

export async function configure(workspace: string, dependencyPolicy: DependencyAdmissionConfig) {
  await writeFile(path.join(workspace, 'repoctl.config.mjs'), `export default ${JSON.stringify({ dependencyPolicy })}\n`)
}
