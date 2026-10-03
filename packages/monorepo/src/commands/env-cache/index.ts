import type { EnvCacheOptions, EnvCacheReport } from '../../types/env-cache'
import { realpath } from 'node:fs/promises'
import path from 'pathe'
import { loadMonorepoConfigDetails } from '../../core/config'
import { clearWorkspaceCache, getWorkspaceData } from '../../core/workspace'
import { loadTurboConfigurations } from './config'
import { evaluate, frameworkDeclarations } from './evaluate'
import { defaultInputs, finding, scanPackage } from './files'
import { settings, suppress } from './settings'

export type * from '../../types/env-cache'

export async function checkEnvironmentCache(cwd: string, options: EnvCacheOptions = {}): Promise<EnvCacheReport> {
  const report: EnvCacheReport = {
    schemaVersion: 1,
    kind: 'environment-cache-check',
    status: 'pass',
    tasks: [],
    findings: [],
    summary: { info: 0, warn: 0, fail: 0, suppressed: 0 },
    limitations: [
      'Source references are candidates for selected tasks, not proof of runtime reachability. By default only build is checked.',
      'Only JavaScript/TypeScript and Vue/Svelte script blocks are scanned. Aliases, shadowed globals, template expressions, generated code and cross-package source imports are not resolved.',
      'Actual environment files and process environment values are never read. Example files contribute names only.',
      'Advanced Turbo global configuration and object-form input declarations are not supported; unsupported shapes fail validation.',
      'Framework inference is estimated from package dependencies. Runtime CLI flags, custom framework prefixes and shell-defined variables may change behavior.',
      'Executable repoctl configuration is loaded normally and must itself avoid side effects for a read-only check.',
    ],
  }
  try {
    clearWorkspaceCache()
    const workspace = await getWorkspaceData(cwd, { ignoreRootPackage: false, ignorePrivatePackage: false })
    const root = path.resolve(await realpath(workspace.workspaceDir))
    const loaded = await loadMonorepoConfigDetails(root, { refresh: true })
    const config = settings(loaded.config.commands?.env, options)
    const packages = workspace.packages.map(pkg => ({ name: pkg.rootDir === root ? '//' : pkg.manifest.name ?? path.relative(root, pkg.rootDir), directory: pkg.rootDir, manifest: pkg.manifest }))
    if (packages.some(pkg => pkg.directory !== root && !pkg.directory.startsWith(`${root}/`))) {
      throw new Error('Workspace package lies outside the canonical root')
    }
    const resolve = await loadTurboConfigurations(root, packages)
    const rootFiles: string[] = []
    for (const pkg of packages.sort((a, b) => a.directory.localeCompare(b.directory))) {
      const scanned = await scanPackage(root, pkg, packages.map(item => item.directory), config.include, config.exclude)
      report.findings.push(...scanned.findings)
      if (pkg.directory === root) {
        rootFiles.push(...scanned.environmentFiles)
      }
      const files = [...new Set([...rootFiles, ...scanned.environmentFiles])].sort()
      const defaults = defaultInputs(root, files)
      const dependencies = [...Object.keys(pkg.manifest.dependencies ?? {}), ...Object.keys(pkg.manifest.devDependencies ?? {})]
      const inferred = frameworkDeclarations(dependencies, config.frameworkInference)
      for (const task of config.tasks) {
        if (!pkg.manifest.scripts?.[task]) {
          continue
        }
        try {
          const configuration = resolve(pkg.name, task)
          if (!configuration.enabled) {
            report.findings.push(finding('env-task-disabled', pkg.name, task, 'This script is not registered as a Turbo task or is excluded from inheritance.', { severity: 'info' }))
            continue
          }
          const evaluated = evaluate(pkg.name, path.relative(root, pkg.directory), task, configuration, scanned.references, scanned.dynamic, files, defaults, inferred)
          report.tasks.push(evaluated.result)
          report.findings.push(...evaluated.findings)
        }
        catch {
          report.findings.push(finding('env-turbo-config', pkg.name, task, 'Task configuration could not be resolved; declaration contents are omitted.', { severity: 'fail' }))
        }
      }
    }
    if (!report.tasks.length) {
      report.findings.push(finding('env-no-tasks', '//', null, 'No workspace scripts matched the selected tasks.'))
    }
    suppress(report.findings, config.suppressions)
  }
  catch {
    report.findings.push(finding('env-config', '//', null, 'Workspace, repoctl or Turbo configuration is invalid or unreadable; contents are omitted.', { severity: 'fail' }))
  }
  for (const item of report.findings) {
    if (item.suppression) {
      report.summary.suppressed++
    }
    else {
      report.summary[item.severity]++
    }
  }
  report.status = report.summary.fail ? 'fail' : report.summary.warn ? 'warn' : 'pass'
  return report
}
