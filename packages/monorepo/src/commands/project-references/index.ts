import { applyProjectReferencesPlan } from './apply'
import { planProjectReferences } from './plan'

export { applyProjectReferencesPlan, planProjectReferences }

export async function checkProjectReferences(cwd: string) {
  const plan = await planProjectReferences(cwd)
  return { schemaVersion: 1 as const, ok: !plan.diagnostics.length && !plan.operations.length, plan }
}

export async function syncProjectReferences(cwd: string) {
  return applyProjectReferencesPlan(await planProjectReferences(cwd))
}
