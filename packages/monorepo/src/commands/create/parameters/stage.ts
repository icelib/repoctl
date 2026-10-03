import type { CreateNewProjectPlan } from '../plan'
import type { PreparedCreateParameters } from './prepare'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { captureTemplateSnapshot, prepareGeneratedTemplateInstance, snapshotDigest } from '@icebreakers/monorepo-templates'
import path from 'pathe'
import { version } from '../../../constants'
import { renderCreateNewProject } from '../render'

export async function stageParameterizedProject(plan: CreateNewProjectPlan, prepared: PreparedCreateParameters, target: string, gitMetadata: boolean) {
  const temporary = await mkdtemp(path.join(tmpdir(), 'repoctl-template-parameters-'))
  const targetDir = path.join(temporary, target)
  try {
    await renderCreateNewProject({ ...plan, cwd: temporary, targetDir, snapshot: prepared.rendered.snapshot, metadataCwd: plan.cwd, metadataTarget: plan.targetDir }, gitMetadata)
    const source = { ...prepared.source, ...(plan.sourceResolution ? { source: { kind: 'remote' as const, templatePath: plan.templateDefinition.source, digest: snapshotDigest(prepared.source.snapshot), remote: plan.sourceResolution.resolved } } : {}) }
    const excludedPaths = prepared.rendered.sensitivePaths.map(file => file.replace(/(^|\/)gitignore$/u, '$1.gitignore'))
    const snapshot = await captureTemplateSnapshot(targetDir)
    const draft = await prepareGeneratedTemplateInstance({
      workspaceDir: temporary,
      targetDir,
      template: plan.template,
      preparedSource: source,
      profile: 'repo-new-parameters-v1',
      parameters: { packageName: plan.packageName, renameJson: plan.renameJson, templateValues: prepared.parameters.retained, sensitiveParameters: prepared.parameters.sensitive },
      excludedPaths,
      generatorVersion: version,
    })
    return { snapshot, draft }
  }
  finally {
    await rm(temporary, { recursive: true, force: true })
  }
}
