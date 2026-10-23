import type { DocsDeploymentPlan } from './types'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'pathe'
import { assertContainedPath } from './artifacts/paths'
import { DocsDiagnosticError } from './diagnostics'

export const docsManifestPath = '.well-known/repoctl-deployment.json'

export function docsManifest(plan: DocsDeploymentPlan) {
  return {
    schemaVersion: 1,
    site: plan.site,
    channel: plan.channel,
    deploymentId: plan.deploymentId,
    sourceSha: plan.sourceSha,
    treeSha: plan.treeSha,
    ...(plan.releaseId ? { releaseId: plan.releaseId } : {}),
  }
}

export async function stampDocsManifest(source: string, output: string, plan: DocsDeploymentPlan) {
  await assertContainedPath(source, output)
  if (!(await stat(output)).isDirectory()) {
    throw new DocsDiagnosticError('artifact-output-missing')
  }
  const filename = path.join(output, docsManifestPath)
  await assertContainedPath(source, filename)
  const expected = docsManifest(plan)
  try {
    const value: unknown = JSON.parse(await readFile(filename, 'utf8'))
    if (!value || typeof value !== 'object' || Object.keys(value).length !== Object.keys(expected).length
      || Object.entries(expected).some(([key, item]) => Reflect.get(value, key) !== item)) {
      throw new DocsDiagnosticError('manifest-conflict')
    }
    return
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new DocsDiagnosticError('manifest-conflict')
    }
  }
  await mkdir(path.dirname(filename), { recursive: true })
  await assertContainedPath(source, filename)
  await writeFile(filename, `${JSON.stringify(expected)}\n`, { flag: 'wx' })
}
