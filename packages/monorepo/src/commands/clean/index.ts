import type { CleanCommandConfig } from '../../types'
import { readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { checkbox } from '@icebreakers/monorepo-templates'
import path from 'pathe'
import { resolveCommandConfig } from '../../core/config'
import { resolveCommandValues } from '../../core/config/resolution'
import { logger } from '../../core/logger'
import { clearWorkspaceCache } from '../../core/workspace'
import { localize } from '../../i18n'
import fs from '../../utils/fs'
import { discoverCleanWorkspace } from './discovery'
import { createCleanPlan } from './plan'
import { assertSafePath, validateCleanTargets } from './safety'

/** Remove only selected workspace directories; dry-run prints every resulting change. */
export async function cleanProjects(cwd: string, overrides?: Partial<CleanCommandConfig>): Promise<void> {
  const workspace = await discoverCleanWorkspace(cwd)
  const config = resolveCommandValues('clean', await resolveCommandConfig('clean', workspace.workspaceDir), overrides).values
  const candidates = workspace.packages.filter(pkg => (config.includePrivate !== false || !pkg.manifest.private)
    && !config.ignorePackages?.includes(pkg.manifest.name ?? ''))
  let selected: string[] = []
  if (config.autoConfirm) {
    selected = candidates.map(pkg => pkg.rootDir)
  }
  else if (candidates.length) {
    try {
      selected = await checkbox<string>({
        message: localize('Select workspace directories to remove', '请选择要删除的工作区目录'),
        choices: candidates.map(pkg => ({
          name: path.relative(workspace.workspaceDir, pkg.rootDir),
          value: pkg.rootDir,
          ...(pkg.manifest.name ? { description: pkg.manifest.name } : {}),
          checked: false,
        })),
      })
    }
    catch (error) {
      if (!(error instanceof Error) || !['ExitPromptError', 'AbortPromptError'].includes(error.name)) {
        throw error
      }
    }
  }
  const candidateDirs = new Set<string>(candidates.map(pkg => pkg.rootDir))
  if (selected.some(dir => !candidateDirs.has(dir))) {
    throw new Error(localize('Cleanup selection contains an unavailable workspace.', '清理选择包含不可用的工作区。'))
  }
  if (selected.length === 0) {
    logger.info(localize('No workspaces selected; no files changed.', '未选择工作区；未修改任何文件。'))
    return
  }
  const planned = await createCleanPlan(workspace, selected, config)
  if (config.dryRun) {
    process.stdout.write(`${JSON.stringify(planned.plan, null, 2)}\n`)
    return
  }

  // Re-discover after planning; validate every target before the first write.
  const current = await discoverCleanWorkspace(cwd)
  if (current.workspaceDir !== workspace.workspaceDir) {
    throw new Error(localize('The workspace changed during cleanup planning.', '生成清理计划期间工作区发生变化。'))
  }
  await validateCleanTargets(current, selected)
  await assertSafePath(workspace.workspaceDir, planned.packageJsonPath, 'file')
  if (await readFile(planned.packageJsonPath, 'utf8') !== planned.original) {
    throw new Error(localize('Root package.json changed during cleanup planning.', '生成清理计划期间根 package.json 发生变化。'))
  }
  try {
    for (const dir of planned.plan.deletions) {
      await fs.remove(path.join(workspace.workspaceDir, dir))
    }
    if (planned.plan.metadata) {
      await writeFile(planned.packageJsonPath, planned.packageJsonContent, 'utf8')
    }
  }
  finally {
    clearWorkspaceCache()
  }
  logger.success(localize('Workspace cleanup finished.', 'Workspace 清理完成。'))
}
