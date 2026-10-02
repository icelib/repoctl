import type { Buffer } from 'node:buffer'
import type { PreparedUpgrade } from './types'
import { Buffer as NodeBuffer } from 'node:buffer'
import path from 'pathe'
import { readUpgradeFile, sameContent } from './files'
import { hasReleaseWorkflowMarker, planLegacyVersioning } from './release-migration'

const workflowPath = '.github/workflows/release.yml'
const workspacePath = 'pnpm-workspace.yaml'
const packagePath = 'package.json'
const legacyPaths = ['.changeset/config.json', '.changeset/pre.json']

export async function addReleaseMigration(prepared: PreparedUpgrade) {
  const { plan, operations, options } = prepared
  const legacy = new Map<string, Buffer>()
  for (const relativePath of legacyPaths) {
    const content = await readUpgradeFile(path.join(plan.targetDir, relativePath))
    if (content !== undefined) {
      legacy.set(relativePath, content)
    }
  }
  if (!legacy.size) {
    return
  }
  const effectiveContent = async (relativePath: string) => {
    const operation = operations.find(item => item.file.path === relativePath)
    return operation && operation.file.action !== 'skip'
      ? operation.after
      : await readUpgradeFile(path.join(plan.targetDir, relativePath))
  }
  const workflow = await effectiveContent(workflowPath)
  const workspace = await effectiveContent(workspacePath)
  const packageContent = await effectiveContent(packagePath)
  const hasTarget = (relativePath: string) => operations.some(item => item.file.path === relativePath)
  const workflowMigrated = workflow !== undefined && hasReleaseWorkflowMarker(workflow.toString('utf8'))
  let blocked = options.noOverwrite || options.skipOverwrite ? 'preserved' : undefined
  // Migration must not reintroduce a writable target the user did not select.
  // An existing managed workflow is the exception: it needs no mutation and
  // can be observed as a read-only dependency of the accepted migration.
  if (!hasTarget(workspacePath)
    || (packageContent !== undefined && !hasTarget(packagePath))
    || (!workflowMigrated && !hasTarget(workflowPath))) {
    blocked = 'migration-targets-not-selected'
  }
  else if (!workflowMigrated) {
    blocked = 'release-workflow-not-migrated'
  }
  const migration = blocked ? undefined : await planLegacyVersioning(plan.targetDir, workspace)
  blocked ??= migration?.blocked
  if (blocked) {
    if (blocked !== 'preserved') {
      const release = operations.find(item => item.file.path === workflowPath)
      if (release && release.file.action !== 'skip') {
        release.file.action = 'skip'
        release.file.reason = blocked
        release.file.requiresConfirmation = false
        release.after = release.before
      }
    }
    for (const [relativePath, before] of legacy) {
      operations.push({
        file: { path: relativePath, action: 'skip', reason: blocked, requiresConfirmation: false, dependsOn: [] },
        targetPath: path.join(plan.targetDir, relativePath),
        before,
        after: before,
      })
    }
    return
  }
  const group = [workflowPath, workspacePath, ...(packageContent ? [packagePath] : []), ...legacy.keys()]
  const upsert = async (relativePath: string, after: Buffer | undefined) => {
    let operation = operations.find(item => item.file.path === relativePath)
    if (!operation) {
      operation = {
        file: { path: relativePath, action: 'skip', reason: 'identical', requiresConfirmation: false, dependsOn: [] },
        targetPath: path.join(plan.targetDir, relativePath),
        before: await readUpgradeFile(path.join(plan.targetDir, relativePath)),
        after,
      }
      operations.push(operation)
    }
    operation.after = after
    if (!sameContent(operation.before, after)) {
      operation.file.action = after === undefined ? 'delete' : operation.before === undefined ? 'create' : 'update'
      operation.file.reason = 'legacy-release'
      operation.file.requiresConfirmation = true
      operation.file.dependsOn = group.filter(item => item !== relativePath)
    }
  }
  for (const relativePath of [workflowPath, workspacePath]) {
    await upsert(relativePath, relativePath === workspacePath ? migration?.workspaceContent ?? workspace : workflow)
  }
  if (packageContent) {
    const manifest = JSON.parse(packageContent.toString('utf8'))
    for (const key of ['dependencies', 'devDependencies']) {
      for (const dependency of ['@changesets/cli', '@icebreakers/changelog-github']) {
        if (manifest[key]) {
          delete manifest[key][dependency]
        }
      }
    }
    await upsert(packagePath, NodeBuffer.from(`${JSON.stringify(manifest, null, 2)}\n`))
  }
  for (const relativePath of migration?.remove ?? []) {
    await upsert(relativePath, undefined)
  }
}
