import type { PreparedTemplateSource, TemplateInstanceDraft } from './types'
import path from 'node:path'
import { templatesDir as defaultTemplatesDir } from '../paths'
import { getTemplateChoices } from '../templates'
import { prepareGeneratedTemplateInstance } from './operations'
import { snapshotDigest } from './snapshot'
import { prepareTemplateInstanceSource } from './source'
import { registerTemplateInstances } from './store'

/** Call after all scaffold and root-manifest transformations have succeeded. */
export async function recordWorkspaceTemplateInstances(workspaceDir: string, templateKeys: string[], templatesDir = defaultTemplatesDir, originals?: Map<string, PreparedTemplateSource>) {
  try {
    const selected = new Set(templateKeys)
    const drafts: TemplateInstanceDraft[] = []
    for (const template of getTemplateChoices()) {
      if (!selected.has(template.key)) {
        continue
      }
      const preparedSource = await prepareTemplateInstanceSource(path.join(templatesDir, template.source))
      if (originals?.has(template.key) && snapshotDigest(originals.get(template.key)!.snapshot) !== snapshotDigest(preparedSource.snapshot)) {
        throw new Error(`Template source changed during creation: ${template.key}. Generated files remain at ${workspaceDir}; no successful registration was written.`)
      }
      drafts.push(await prepareGeneratedTemplateInstance({
        workspaceDir,
        targetDir: path.join(workspaceDir, template.target),
        template: template.key,
        preparedSource,
        profile: 'workspace-copy-v1',
      }))
    }
    if (!drafts.length) {
      return []
    }
    return await registerTemplateInstances(workspaceDir, drafts)
  }
  catch (error) {
    throw new Error(`Scaffolded files remain at ${workspaceDir}, but template registration did not complete. Registry recovery path: ${path.join(workspaceDir, '.repoctl/template-instances.json')}. Inspect the error and use repo templates link for each generated target.`, { cause: error })
  }
}
