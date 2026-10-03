import type { TemplateValidationOptions, TemplateValidationReport } from './types'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { prepareTemplateValidationPlan } from './plan'
import { runValidationSample } from './run'

export { planTemplateValidation } from './plan'
export type { TemplateValidationDiagnostic, TemplateValidationOptions, TemplateValidationParameterSet, TemplateValidationPlan, TemplateValidationReport, TemplateValidationSample, TemplateValidationStage, TemplateValidationStep } from './types'

/** Explicitly execute a template author's generated project and publication checks. */
export async function validateTemplate(options: TemplateValidationOptions): Promise<TemplateValidationReport> {
  if (process.env['REPOCTL_PACKAGE_CHECK_RUNNING']) {
    throw new Error('Template validation cannot run recursively from a validation script.')
  }
  const plan = await prepareTemplateValidationPlan(options, true)
  const report: TemplateValidationReport = { schemaVersion: 1, status: plan.diagnostics.length ? 'failed' : 'passed', plan, samples: [], retained: false }
  if (plan.diagnostics.length) {
    return report
  }
  const temporary = await mkdtemp(path.join(tmpdir(), 'repoctl-template-validation-'))
  report.temporaryDirectory = temporary
  try {
    const combinations = plan.names.flatMap(name => plan.parameterSets.map(parameterSet => ({ name, parameterSet })))
    for (const [index, { name, parameterSet }] of combinations.entries()) {
      const sample = await runValidationSample(plan, name, path.join(temporary, `sample-${index}`), options, parameterSet)
      report.samples.push(sample)
      if (sample.status !== 'passed') {
        report.status = sample.status
      }
      if (sample.status === 'interrupted') {
        break
      }
    }
    return report
  }
  finally {
    report.retained = options.keep === 'always' || (options.keep === 'failure' && report.status !== 'passed')
    if (report.retained) {
      await writeFile(path.join(temporary, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
    }
    else {
      await rm(temporary, { recursive: true, force: true })
    }
  }
}
