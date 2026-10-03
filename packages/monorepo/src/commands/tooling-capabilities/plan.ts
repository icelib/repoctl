import type { ToolingCapabilityOptions, ToolingCapabilityPlan } from './types'
import { Buffer } from 'node:buffer'
import { readdir } from 'node:fs/promises'
import path from 'pathe'
import { hash, readOptional } from '../../core/file-transaction/paths'
import { fileDiff } from '../upgrade/plan/diff'
import { playwrightFiles } from './playwright/files'
import { playwrightWorkflow } from './playwright/workflow'
import { listToolingCapabilities } from './registry'
import { rootFiles } from './root-files'
import { resolveCapabilitySettings } from './settings'

export async function planToolingCapability(cwd: string, input: ToolingCapabilityOptions): Promise<ToolingCapabilityPlan> {
  const settings = await resolveCapabilitySettings(cwd, input)
  const conflicts: ToolingCapabilityPlan['conflicts'] = []
  if (await readOptional(settings.root, `${settings.workspace.directory}/package.json`) === null) {
    try {
      if ((await readdir(path.join(settings.root, settings.workspace.directory))).length) {
        conflicts.push({ id: 'occupied-directory', path: settings.workspace.directory, detail: 'Choose an empty directory; existing files have no capability workspace manifest' })
      }
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  }
  const generated = playwrightFiles(settings)
  const roots = await rootFiles(settings, conflicts)
  const workflowPath = `.github/workflows/e2e-${settings.workspace.name.replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}.yml`
  const desired = { ...generated.files, ...roots, [workflowPath]: playwrightWorkflow(settings) }
  const files: ToolingCapabilityPlan['files'] = []
  for (const [file, content] of Object.entries(desired).sort(([a], [b]) => a.localeCompare(b))) {
    const current = await readOptional(settings.root, file)
    const before = current?.toString() ?? null
    const beforeHash = current ? hash(current) : null
    const afterHash = hash(Buffer.from(content))
    let status: ToolingCapabilityPlan['files'][number]['status'] = beforeHash === afterHash ? 'identical' : before === null ? 'add' : 'modify'
    if (before !== null && beforeHash !== afterHash && file !== 'package.json' && file !== 'pnpm-workspace.yaml' && file !== 'turbo.json') {
      conflicts.push({ id: 'existing-file', path: file, detail: 'Existing file differs from the generated capability asset' })
      status = 'conflict'
    }
    files.push({ path: file, status, beforeHash, afterHash, before, after: content, diff: fileDiff(file, current, Buffer.from(content)).diff })
  }
  const status = conflicts.length ? 'blocked' : files.every(file => file.status === 'identical') ? 'unchanged' : 'ready'
  return {
    schemaVersion: 1,
    rootDir: settings.root,
    capability: listToolingCapabilities()[0]!,
    options: settings.options,
    target: settings.target,
    workspace: settings.workspace,
    status,
    files,
    dependencies: Object.entries(generated.dependencies).map(([name, version]) => ({ package: settings.workspace.name, name, version, kind: 'devDependencies' as const })),
    scripts: Object.entries(generated.scripts).map(([name, command]) => ({ package: settings.workspace.name, name, command })),
    conflicts,
    nextSteps: status === 'blocked' ? ['Resolve the listed conflicts and rerun the plan.'] : ['Review the file and dependency changes.', 'Run pnpm install at the workspace root and commit the lockfile', `Run pnpm --filter ${settings.workspace.name} test:e2e:install`, 'Run pnpm test:e2e at the workspace root'],
  }
}
