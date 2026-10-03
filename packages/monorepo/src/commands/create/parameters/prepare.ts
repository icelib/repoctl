import type { PreparedTemplateSource, ResolvedTemplateParameters, TemplateParameterPrompt, TemplateParameterRender } from '@icebreakers/monorepo-templates'
import type { CreateNewProjectPlan } from '../plan'
import { prepareTemplateInstanceSource, promptTemplateParameters, readTemplateParameterManifest, renderTemplateParameters, resolveTemplateParameters } from '@icebreakers/monorepo-templates'
import { rewriteTemplateSnapshotReferences } from '../render'

export interface CreateParameterReport {
  schemaVersion: 1
  values: ResolvedTemplateParameters['report']
  files: TemplateParameterRender['files']
  package: TemplateParameterRender['package']
  excludedPaths: string[]
}
export interface PreparedCreateParameters {
  source: PreparedTemplateSource
  parameters: ResolvedTemplateParameters
  rendered: TemplateParameterRender
  fingerprint: string
}
const preparedPlans = new WeakMap<CreateNewProjectPlan, PreparedCreateParameters>()
const planIdentities = new WeakMap<CreateNewProjectPlan, { fingerprint: string, source: PreparedTemplateSource }>()

export async function attachCreateParameters(plan: CreateNewProjectPlan, values: unknown, prompt?: TemplateParameterPrompt) {
  const source = await prepareTemplateInstanceSource(plan.sourceDir)
  const manifest = readTemplateParameterManifest(source.snapshot)
  if (!manifest) {
    resolveTemplateParameters({}, values ?? {})
    planIdentities.set(plan, { source, fingerprint: JSON.stringify(plan) })
    return plan
  }
  const parameters = prompt ? await promptTemplateParameters(manifest.parameters, values ?? {}, prompt) : resolveTemplateParameters(manifest.parameters, values ?? {})
  const rendered = renderTemplateParameters(rewriteTemplateSnapshotReferences(source.snapshot, plan.targetDir, plan.cwd), manifest, parameters)
  plan.parameterization = { schemaVersion: 1, values: parameters.report, files: rendered.files, package: rendered.package, excludedPaths: rendered.sensitivePaths }
  preparedPlans.set(plan, { source, parameters, rendered, fingerprint: JSON.stringify(plan) })
  planIdentities.set(plan, { source, fingerprint: JSON.stringify(plan) })
  return plan
}

export function validateCreatePlan(plan: CreateNewProjectPlan) {
  const identity = planIdentities.get(plan)
  if (!identity || identity.fingerprint !== JSON.stringify(plan)) {
    throw new Error('The creation plan changed or lost its private inputs. Resolve a fresh plan before applying.')
  }
  return identity.source
}

export function getPreparedCreateParameters(plan: CreateNewProjectPlan) {
  const prepared = preparedPlans.get(plan)
  if (!prepared || prepared.fingerprint !== JSON.stringify(plan)) {
    throw new Error('The parameterized creation plan changed or lost its private inputs. Resolve a fresh plan with the original parameter data before applying.')
  }
  return prepared
}
