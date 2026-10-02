import path from 'pathe'
import fs from '@/utils/fs'
import { appendWorkspaceManifestPatterns, parseWorkspaceManifest } from '../../../core/workspace/manifest'

interface InitWorkspaceManifestPlan {
  path: string
  /** Omitted when the existing document does not need a change. */
  content?: string
}

const defaultWorkspacePackages = ['apps/*', 'packages/*', 'examples/*']

/** Plan and validate before initialization creates or changes any files. */
export async function prepareInitWorkspaceManifest(cwd: string): Promise<InitWorkspaceManifestPlan> {
  const workspacePath = path.resolve(cwd, 'pnpm-workspace.yaml')
  const exists = await fs.pathExists(workspacePath)
  const original = exists ? await fs.readFile(workspacePath, 'utf8') : null
  const parsed = parseWorkspaceManifest(original ?? '')
  const { document, patterns } = parsed

  // A null value or a mapping without `packages` uses pnpm's implicit ** rule.
  // An empty document needs defaults because pnpm's YAML reader rejects it.
  if (exists && document.contents !== null && patterns === undefined) {
    return { path: workspacePath }
  }
  const missing = defaultWorkspacePackages.filter(pattern => !patterns?.includes(pattern))
  if (missing.length === 0) {
    return { path: workspacePath }
  }

  const content = appendWorkspaceManifestPatterns(parsed, missing, { singleQuote: true })
  return { path: workspacePath, content }
}
