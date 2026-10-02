import type { TemplateValidationOptions, TemplateValidationPlan, TemplateValidationSample, TemplateValidationStage } from './types'
import path from 'node:path'
import { isolatedProcessEnvironment } from '../../core/process-environment'
import { execute } from '../package-check/process'
import { validateLibraryArtifact } from './artifact'
import { inspectGeneratedFiles } from './files'
import { generateValidationSample } from './generate'

export async function runValidationSample(plan: TemplateValidationPlan, name: string, directory: string, options: TemplateValidationOptions): Promise<TemplateValidationSample> {
  const sample: TemplateValidationSample = { name, directory, status: 'passed', steps: [] }
  let stage: TemplateValidationStage = 'generate'
  const timeout = options.timeoutMs ?? 240_000
  try {
    if (options.signal?.aborted) {
      throw new Error('Template validation interrupted.')
    }
    const target = await generateValidationSample(plan, directory, name)
    const diagnostics = await inspectGeneratedFiles(directory, directory, [plan.sourceDir, plan.fixtureDir])
    sample.steps.push({ stage, status: diagnostics.length ? 'failed' : 'passed', diagnostics })
    if (diagnostics.length) {
      throw new Error('Generated workspace contains external references.')
    }
    for (const script of ['install', ...plan.scripts]) {
      stage = script as TemplateValidationStage
      const args = script === 'install'
        ? ['pnpm', 'install', '--ignore-scripts', '--no-frozen-lockfile']
        : script === 'build'
          ? ['pnpm', '--filter', `${name}...`, '--recursive', '--if-present', 'run', 'build']
          : ['pnpm', 'run', script]
      const command = await execute('corepack', args, script === 'install' || script === 'build' ? directory : target, timeout, { signal: options.signal, env: isolatedProcessEnvironment(path.dirname(directory)) })
      sample.steps.push({ stage, status: command.exitCode === 0 ? 'passed' : options.signal?.aborted ? 'interrupted' : 'failed', command, diagnostics: [] })
      if (command.exitCode !== 0) {
        throw new Error(`Template validation ${script} failed.`)
      }
    }
    if (plan.category === 'library') {
      stage = 'artifact'
      sample.artifact = await validateLibraryArtifact(target, `${directory}-artifact`, timeout, plan.packageManager, options.signal)
      const diagnostics = sample.artifact.packages.flatMap(item => item.diagnostics).filter(item => item.severity === 'error').map(item => ({ code: item.code, message: item.message, ...(item.file ? { file: item.file } : {}) }))
      sample.steps.push({ stage, status: sample.artifact.status === 'passed' ? 'passed' : 'failed', diagnostics })
      if (sample.artifact.status !== 'passed') {
        throw new Error('Packed template library validation failed.')
      }
    }
  }
  catch (error) {
    sample.status = options.signal?.aborted ? 'interrupted' : 'failed'
    sample.failedStage = stage
    const last = sample.steps.at(-1)
    if (last?.stage !== stage || last.status === 'passed') {
      sample.steps.push({ stage, status: sample.status, diagnostics: [{ code: sample.status === 'interrupted' ? 'INTERRUPTED' : 'STAGE_FAILED', message: String(error) }] })
    }
  }
  return sample
}
