import type { TemplateCategory, TemplateParameterValues } from '@icebreakers/monorepo-templates'
import type { PackageCheckCommand } from '../package-check'
import type { TemplateValidationDiagnostic, TemplateValidationParameterSet, TemplateValidationSample } from './types'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { prepareTemplateInstanceSource, readTemplateParameterManifest, renderTemplateParameters, resolveTemplateParameters } from '@icebreakers/monorepo-templates'

interface PrivateParameterSet {
  values: TemplateParameterValues
  sourceDigest: string
  secrets: string[]
}
const preparedSets = new WeakMap<TemplateValidationParameterSet, PrivateParameterSet>()

export function validationSourceDigest(snapshot: unknown) {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')
}

export function privateValidationParameters(set: TemplateValidationParameterSet) {
  const prepared = preparedSets.get(set)
  if (!prepared) {
    throw new Error('Resolve a fresh template validation plan before execution.')
  }
  return prepared
}

/** Preserve protocol enums; redact only parameter data and execution-derived text. */
export function sanitizeValidationSample(sample: TemplateValidationSample, set: TemplateValidationParameterSet): TemplateValidationSample {
  const { secrets } = privateValidationParameters(set)
  if (!secrets.length) {
    return sample
  }
  const tokens = [...new Set(secrets.flatMap(secret => [secret, JSON.stringify(secret).slice(1, -1)]))].sort((a, b) => b.length - a.length)
  const redact = (text: string) => tokens.reduce((result, token) => result.replaceAll(token, '[redacted]'), text)
  const hidden = '[redacted: sensitive template parameters]'
  const command = (value: PackageCheckCommand): PackageCheckCommand => ({
    ...value,
    cwd: redact(value.cwd),
    args: value.args.map(redact),
    output: hidden,
    stdout: hidden,
    stderr: hidden,
  })
  const diagnostic = <T extends TemplateValidationDiagnostic>(value: T): T => ({
    ...value,
    message: hidden,
    ...(value.file ? { file: redact(value.file) } : {}),
    ...('entry' in value && typeof value.entry === 'string' ? { entry: redact(value.entry) } : {}),
    ...('detail' in value ? { detail: hidden } : {}),
  })
  return {
    ...sample,
    steps: sample.steps.map(step => ({ ...step, ...(step.command ? { command: command(step.command) } : {}), diagnostics: step.diagnostics.map(diagnostic) })),
    ...(sample.artifact
      ? { artifact: {
          ...sample.artifact,
          ...(sample.artifact.build ? { build: command(sample.artifact.build) } : {}),
          packages: sample.artifact.packages.map(pkg => ({
            ...pkg,
            ...(pkg.reason ? { reason: hidden } : {}),
            ...(pkg.tarball ? { tarball: redact(pkg.tarball) } : {}),
            files: pkg.files.map(redact),
            commands: pkg.commands.map(command),
            diagnostics: pkg.diagnostics.map(diagnostic),
          })),
        } }
      : {}),
  }
}

export async function prepareValidationParameters(sourceDir: string, category: TemplateCategory | null, names: string[], inputs: TemplateParameterValues[] = [{}]) {
  if (!Array.isArray(inputs) || inputs.length === 0 || names.length * inputs.length > 20) {
    throw new Error('Provide 1–20 total samples across names and parameter sets.')
  }
  const source = await prepareTemplateInstanceSource(sourceDir)
  const manifest = readTemplateParameterManifest(source.snapshot)
  const sets = inputs.map((input, index) => {
    const parameters = resolveTemplateParameters(manifest?.parameters ?? {}, input)
    const snapshot = manifest ? renderTemplateParameters(source.snapshot, manifest, parameters).snapshot : source.snapshot
    const packageFile = snapshot.files.find(file => file.path === 'package.json')
    if (!packageFile) {
      throw new Error('The template must include package.json.')
    }
    const pkg = JSON.parse(Buffer.from(packageFile.content, 'base64').toString('utf8'))
    const typed = snapshot.files.some(file => /\.(?:[cm]?tsx?|vue)$/u.test(file.path))
    const styles = snapshot.files.some(file => /\.(?:css|scss|less|sass|vue)$/u.test(file.path))
    const styleScript = styles && !/\bstylelint\b/u.test(pkg.scripts?.lint ?? '') ? ['lint:styles'] : []
    const scripts = ['build', 'lint', ...styleScript, ...(typed ? ['typecheck'] : []), ...(category === 'library' && typed ? ['tsd'] : []), 'test']
    if (typeof pkg.scripts?.['test:e2e'] === 'string') {
      scripts.push('test:e2e')
    }
    const set: TemplateValidationParameterSet = {
      index,
      parameters: parameters.report,
      scripts,
      diagnostics: scripts.filter(script => typeof pkg.scripts?.[script] !== 'string' || !pkg.scripts[script].trim()).map(script => ({
        code: 'MISSING_REQUIRED_SCRIPT',
        file: 'package.json',
        parameterSet: index,
        message: `Missing required script: ${script}`,
      })),
    }
    preparedSets.set(set, {
      values: parameters.values,
      sourceDigest: validationSourceDigest(source.snapshot),
      secrets: parameters.sensitive.map(key => String(parameters.values[key])).filter(Boolean),
    })
    return set
  })
  return { sets }
}
