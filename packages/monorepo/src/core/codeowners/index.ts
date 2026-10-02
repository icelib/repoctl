import type { CodeownersOptions, CodeownersPlan } from './types'
import path from 'node:path'
import { getRepoctlConfigCandidates } from '../config'
import { ownersDiff, updateOwnersBlock } from './block'
import { codeownersPaths, hashContent, readOptional, replaceOwnersFile, validateOwnersTarget } from './files'
import { inspectWorkspaceOwners } from './ownership'

export { inspectWorkspaceOwners } from './ownership'
export type * from './types'

/** Read-only preview; the output file must be explicitly selected. */
export async function planCodeowners(options: Omit<CodeownersOptions, 'query'> & { file: string }): Promise<CodeownersPlan> {
  const report = await inspectWorkspaceOwners(options)
  const { workspaceDir } = report
  const target = await validateOwnersTarget(workspaceDir, options.file)
  const file = path.relative(workspaceDir, target).replaceAll('\\', '/')
  const before = await readOptional(target)
  const after = updateOwnersBlock(before ?? '', report.packages, report.diagnostics)
  const paths = [...report.configFiles, ...codeownersPaths.slice(0, codeownersPaths.indexOf(file)).map(file => path.join(workspaceDir, file)), ...getRepoctlConfigCandidates(workspaceDir), path.join(workspaceDir, 'pnpm-workspace.yaml'), path.join(workspaceDir, 'package.json'), ...report.packages.map(pkg => path.join(workspaceDir, pkg.path, 'package.json'))]
  const inputs: Record<string, string | null> = {}
  for (const input of [...new Set(paths)].sort()) {
    inputs[path.relative(workspaceDir, input).replaceAll('\\', '/')] = hashContent(await readOptional(input))
  }
  for (const preferred of codeownersPaths.slice(0, codeownersPaths.indexOf(file))) {
    if (await readOptional(path.join(workspaceDir, preferred)) !== null) {
      report.diagnostics.push({ code: 'INACTIVE_FILE', severity: 'warning', source: file, message: `GitHub selects ${preferred} before ${file}; this output may not be the active ownership file.` })
      break
    }
  }
  return { ...report, file, before, after, diff: ownersDiff(file, before, after), changed: before !== after, inputs }
}

/** Recompute the preview and reject changed inputs before atomically replacing one file. */
export async function applyCodeownersPlan(plan: CodeownersPlan): Promise<{ status: 'applied' | 'unchanged', file: string }> {
  if (plan.schemaVersion !== 1) {
    throw new Error('Unsupported CODEOWNERS plan schema.')
  }
  const fresh = await planCodeowners({ cwd: plan.workspaceDir, file: plan.file })
  if (fresh.diagnostics.some(item => item.severity === 'error') || plan.diagnostics.some(item => item.severity === 'error')) {
    throw new Error('Resolve CODEOWNERS errors before applying the plan.')
  }
  if (JSON.stringify(fresh.inputs) !== JSON.stringify(plan.inputs) || JSON.stringify(fresh.packages) !== JSON.stringify(plan.packages) || fresh.after !== plan.after) {
    throw new Error('CODEOWNERS inputs or generated content changed; regenerate the plan.')
  }
  if (fresh.before === plan.after) {
    return { status: 'unchanged', file: fresh.file }
  }
  if (fresh.before !== plan.before) {
    throw new Error('CODEOWNERS changed after preview; regenerate the plan.')
  }
  await replaceOwnersFile(fresh.workspaceDir, fresh.file, fresh.before, fresh.after)
  return { status: 'applied', file: fresh.file }
}
