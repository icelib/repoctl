import type { KnipCheckOptions, KnipCheckReport } from '../../../types/knip'
import { isDeepStrictEqual } from 'node:util'
import { compareKnipBaseline } from './baseline'
import { knipConfigurationInputs } from './inputs'
import { parseKnipOutput, summarizeKnip } from './native'
import { planKnipCheck } from './plan'
import { executeKnip } from './process'

export async function runKnipCheck(cwd: string, options: KnipCheckOptions = {}): Promise<KnipCheckReport> {
  const plan = await planKnipCheck(cwd, options)
  const report: KnipCheckReport = {
    schemaVersion: 1,
    kind: 'knip-report',
    workspaceDir: plan.workspaceDir,
    status: 'failed',
    exitCode: 2,
    nativeExitCode: null,
    plan,
    scope: null,
    findings: [],
    summary: summarizeKnip([]),
    baseline: { status: 'none', path: plan.baseline, existing: [], added: [], fixed: [] },
    diagnostics: [],
  }
  if (plan.status !== 'ready') {
    report.diagnostics.push({ code: plan.status, message: plan.guidance.join('\n') })
    return report
  }
  try {
    const inputs = await knipConfigurationInputs(plan.workspaceDir, plan.config)
    const result = await executeKnip(plan.executable, plan.args, plan.workspaceDir, plan.timeoutMs, options.signal)
    report.nativeExitCode = result.exitCode
    if (result.stderr.trim()) {
      report.diagnostics.push({ code: 'knip_stderr', message: result.stderr.trim() })
    }
    if (result.failure) {
      report.diagnostics.push(result.failure)
      return report
    }
    const native = parseKnipOutput(plan.workspaceDir, result.stdout)
    if (native.output) {
      report.diagnostics.push({ code: 'knip_stdout', message: native.output })
    }
    if (!isDeepStrictEqual(inputs, await knipConfigurationInputs(plan.workspaceDir, plan.config))) {
      throw new Error('Knip primary configuration changed during analysis. Run the check again.')
    }
    report.findings = native.findings
    report.summary = summarizeKnip(native.findings)
    report.scope = {
      toolVersion: plan.tool.version!,
      production: plan.production,
      strict: plan.strict,
      ...inputs,
      workspaces: native.workspaces,
      configFile: native.configFile,
      report: native.report,
      plugins: native.plugins,
    }
    if (result.exitCode === 1 && report.summary.errors === 0) {
      throw new Error('Knip failed without a reported error diagnostic; the analysis cannot pass or update a baseline.')
    }
    report.baseline = await compareKnipBaseline(plan.baseline, report.scope, report.findings)
    if (report.baseline.status === 'invalid') {
      report.diagnostics.push({ code: 'invalid_baseline', message: report.baseline.reason! })
      return report
    }
    const blocking = plan.newOnly ? summarizeKnip(report.baseline.added).errors : report.summary.errors
    report.status = 'completed'
    report.exitCode = blocking ? 1 : 0
  }
  catch (error) {
    report.diagnostics.push({ code: 'incomplete_analysis', message: (error as Error).message })
  }
  return report
}
