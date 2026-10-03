import type { DependencyScan } from './scan'
import { isDeepStrictEqual } from 'node:util'
import { localize } from '../../i18n'
import { record } from './files'

export interface DependencyGuardPlan {
  schemaVersion: 1
  workspaceDir: string
  selection: unknown
  inputs: { path: string, hash: string }[]
  files: { path: string, beforeHash: string, afterHash: string }[]
}

export function validateDependencyPlan(plan: DependencyGuardPlan) {
  if (!record(plan) || plan.schemaVersion !== 1 || typeof plan.workspaceDir !== 'string' || !record(plan.selection)
    || !Array.isArray(plan.inputs) || !Array.isArray(plan.files)
    || plan.inputs.some(item => !record(item) || typeof item.path !== 'string' || typeof item.hash !== 'string')
    || plan.files.some(item => !record(item) || typeof item.path !== 'string' || typeof item.beforeHash !== 'string' || typeof item.afterHash !== 'string')
    || new Set(plan.inputs.map(item => item.path)).size !== plan.inputs.length
    || new Set(plan.files.map(item => item.path)).size !== plan.files.length) {
    throw new Error(localize('Invalid dependency fix plan.', '依赖修复计划无效。'))
  }
}

/** Verify the entire input snapshot before any caller stages replacements. */
export function inspectDependencyPlanInputs(scan: DependencyScan, plan: DependencyGuardPlan) {
  if (scan.workspaceDir !== plan.workspaceDir || !isDeepStrictEqual(scan.inputs.map(item => item.path), plan.inputs.map(item => item.path))) {
    throw new Error(localize('The workspace or input file set changed; generate a new dependency plan.', '工作区或输入文件集合已变更，请重新生成依赖计划。'))
  }
  let pending = 0
  let applied = 0
  for (const input of scan.inputs) {
    const expected = plan.inputs.find(item => item.path === input.path)!
    const change = plan.files.find(item => item.path === input.path)
    if (change && change.beforeHash !== expected.hash) {
      throw new Error(localize('The plan contains inconsistent input hashes.', '计划中的输入校验值不一致。'))
    }
    if (input.hash === expected.hash) {
      if (change) {
        pending++
      }
    }
    else if (change && input.hash === change.afterHash) {
      applied++
    }
    else {
      throw new Error(localize(`Dependency plan conflict: ${input.path} changed.`, `依赖计划冲突：${input.path} 已变更。`))
    }
  }
  if (plan.files.some(file => !scan.inputs.some(input => input.path === file.path))) {
    throw new Error(localize('The plan contains an undiscovered file.', '计划包含不属于工作区输入的文件。'))
  }
  if (applied && pending) {
    throw new Error(localize('The plan is partially applied; restore the retained backups or generate a new plan after review.', '计划只应用了一部分；请恢复保留的备份，或核查后重新生成计划。'))
  }
  if (applied === plan.files.length && applied > 0) {
    return true
  }
  return false
}
