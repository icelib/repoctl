import type { WorkspaceBoundariesConfig, WorkspaceBoundariesReport } from './types'
import { ConfigValidationError } from '../config/validation'
import { getWorkspaceGraph } from '../workspace-graph'
import { BoundaryConfigError, parseBoundariesConfig } from './config'
import { evaluateBoundaries } from './evaluate'
import { loadBoundaryConfiguration } from './project'

export type * from './types'

/** Manifest graph inspection only: never executes tasks, rewrites dependencies or scans imports. */
export async function checkWorkspaceBoundaries(cwd: string, options: { config?: WorkspaceBoundariesConfig } = {}): Promise<WorkspaceBoundariesReport> {
  const graph = await getWorkspaceGraph(cwd, { ignoreRootPackage: false, ignorePrivatePackage: false })
  const report: WorkspaceBoundariesReport = {
    schemaVersion: 1,
    workspaceDir: graph.workspaceDir,
    configFile: null,
    packageCount: graph.nodes.length,
    findings: [],
    exceptions: [],
    summary: { warn: 0, fail: 0, waived: 0 },
  }
  try {
    const loaded = options.config === undefined ? await loadBoundaryConfiguration(graph.workspaceDir) : null
    report.configFile = loaded?.file ?? null
    const configured = options.config !== undefined ? options.config : loaded?.config
    const config = parseBoundariesConfig(configured === undefined ? {} : configured)
    evaluateBoundaries(graph, config, report)
  }
  catch (error) {
    const diagnostic = error instanceof ConfigValidationError ? error.diagnostics[0] : undefined
    report.findings.push({ id: 'boundary-config', status: 'fail', field: diagnostic?.path ?? (error instanceof BoundaryConfigError ? error.field : 'boundaries'), detail: error instanceof ConfigValidationError || error instanceof BoundaryConfigError ? error.message : 'Unable to load boundary configuration. Review repoctl.config and its imports.' })
  }
  for (const finding of report.findings) {
    report.summary[finding.status]++
  }
  report.summary.waived = report.exceptions.reduce((sum, exception) => sum + exception.edges.length, 0)
  return report
}
