import type { WorkspaceArtifactApplyOptions, WorkspaceArtifactOptions, WorkspaceArtifactPlan, WorkspaceArtifactResult } from '../../../types/artifact'
import { lstat, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isDeepStrictEqual } from 'node:util'
import path from 'pathe'
import { withOperationLock } from '../../../core/operation-lock'
import { discoverCleanWorkspace } from '../../clean/discovery'
import { buildArtifactPlan } from './plan'
import { runNative } from './process'
import { publishArtifact } from './publication'
import { previousArtifact } from './receipt'
import { verifyWritePaths } from './settings'
import { copySource, inventory } from './tree'
import { inspectNativeOutput, verifySource } from './verify'

export async function planWorkspaceArtifact(cwd: string, options: WorkspaceArtifactOptions): Promise<WorkspaceArtifactPlan> {
  const plan = await buildArtifactPlan(cwd, options)
  await previousArtifact(plan)
  return plan
}

export async function applyWorkspaceArtifactPlan(cwd: string, plan: WorkspaceArtifactPlan, options: WorkspaceArtifactApplyOptions = {}): Promise<WorkspaceArtifactResult> {
  if (!plan || plan.schemaVersion !== 1 || plan.kind !== 'workspace-artifact' || !plan.selection || !Array.isArray(plan.inputs)) {
    throw new Error('A reviewed workspace artifact plan is required.')
  }
  options.signal?.throwIfAborted()
  const root = (await discoverCleanWorkspace(cwd)).workspaceDir
  if (root !== plan.workspaceDir) {
    throw new Error('Artifact plan belongs to another workspace.')
  }
  return withOperationLock(root, 'workspace-artifacts', async () => {
    const current = await buildArtifactPlan(root, plan.selection)
    if (!isDeepStrictEqual(current, plan)) {
      throw new Error('Artifact plan, inputs or native tool changed; review a new plan.')
    }
    const previous = await previousArtifact(plan)
    if (previous) {
      return { status: 'unchanged', mode: plan.selection.mode, output: plan.selection.output, entry: plan.entry, files: previous.files.length, excluded: previous.excluded, cleanupPending: [] }
    }
    options.signal?.throwIfAborted()
    const temporary = path.resolve(await realpath(await mkdtemp(path.join(tmpdir(), 'repoctl-artifact-'))))
    const identity = await lstat(temporary)
    const workspace = path.join(temporary, 'workspace')
    const output = path.join(temporary, 'output')
    const cleanupPending: string[] = []
    let result: WorkspaceArtifactResult | undefined
    let failure: unknown
    try {
      await copySource(root, workspace, plan.inputs)
      if (!isDeepStrictEqual((await inventory(workspace, true)).files, plan.inputs)) {
        throw new Error('Artifact source changed while copying; no output was published.')
      }
      await verifySource(plan)
      await verifyWritePaths(root, workspace, plan.tool.writePaths)
      await runNative(plan.command.executable, plan.command.args.map(arg => arg === '<output>' ? output : arg), workspace, options)
      options.signal?.throwIfAborted()
      const artifact = await inspectNativeOutput(plan, output)
      await verifySource(plan)
      await publishArtifact(plan, output, artifact.files, artifact.excluded, async () => {
        options.signal?.throwIfAborted()
        await verifySource(plan)
      })
      result = { status: 'applied', mode: plan.selection.mode, output: plan.selection.output, entry: plan.entry, files: artifact.files.length, excluded: artifact.excluded, cleanupPending }
    }
    catch (error) {
      failure = error
    }
    try {
      const stat = await lstat(temporary)
      if (stat.isSymbolicLink() || stat.ino !== identity.ino || stat.dev !== identity.dev || path.normalize(await realpath(temporary)) !== temporary) {
        throw new Error('Temporary directory identity changed')
      }
      await rm(temporary, { recursive: true, force: true })
    }
    catch {
      cleanupPending.push(temporary)
    }
    if (failure) {
      if (cleanupPending.length) {
        throw new AggregateError([failure], `Artifact preparation failed; inspect retained staging directories: ${cleanupPending.join(', ')}`)
      }
      throw failure
    }
    return result!
  })
}
