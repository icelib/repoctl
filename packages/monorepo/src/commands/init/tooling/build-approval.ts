import path from 'node:path'
import YAML from 'yaml'
import { logger } from '../../../core/logger'
import { localize } from '../../../i18n'
import fs from '../../../utils/fs'
import { mergeWorkspaceManifest, normalizeWorkspaceManifest } from '../../upgrade/workspace'

export async function ensureLefthookBuildApproval(cwd: string) {
  const workspacePath = path.join(cwd, 'pnpm-workspace.yaml')
  const content = await fs.pathExists(workspacePath) ? await fs.readFile(workspacePath, 'utf8') : ''
  const workspace = normalizeWorkspaceManifest(YAML.parse(content))
  const merged = mergeWorkspaceManifest(normalizeWorkspaceManifest({ allowBuilds: { lefthook: true } }), workspace)
  if ((workspace.allowBuilds as Record<string, unknown> | undefined)?.['lefthook'] === false
    || (Array.isArray(workspace.ignoredBuiltDependencies) && workspace.ignoredBuiltDependencies.includes('lefthook'))) {
    logger.info(localize('Lefthook postinstall is disabled by the workspace build policy. Run pnpm exec lefthook install manually.', 'workspace 安装脚本策略禁用了 Lefthook postinstall，请手动运行 pnpm exec lefthook install。'))
    return
  }
  await fs.outputFile(workspacePath, YAML.stringify(merged, { singleQuote: true }))
}
