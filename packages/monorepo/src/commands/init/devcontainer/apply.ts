import type { DevContainerPlan, DevContainerResult } from '../../../types/devcontainer'
import { Buffer } from 'node:buffer'
import { writeFileTransaction } from '../../../core/file-transaction'
import { withOperationLock } from '../../../core/operation-lock'
import { assertInputs, hash } from './files'
import { planDevContainer } from './plan'

async function apply(cwd: string, plan: DevContainerPlan): Promise<DevContainerResult> {
  const current = await planDevContainer(cwd, { nodeVersion: plan.nodeVersion })
  if (current.workspaceDir !== plan.workspaceDir || JSON.stringify(current.inputs) !== JSON.stringify(plan.inputs)) {
    throw new Error('Dev Container workspace inputs changed; generate a fresh plan.')
  }
  const desired = (value: DevContainerPlan) => value.files.map(file => ({ path: file.path, content: file.content, afterHash: file.afterHash }))
  if (JSON.stringify(desired(current)) !== JSON.stringify(desired(plan))) {
    throw new Error('Dev Container preset changed; generate a fresh plan.')
  }
  if (current.status === 'ready' && current.files.every(file => file.action === 'unchanged')) {
    return { status: 'unchanged', workspaceDir: current.workspaceDir, files: [] }
  }
  if (current.fingerprint !== plan.fingerprint) {
    throw new Error('Dev Container targets changed or conflict; generate a fresh plan.')
  }
  // Publish the entry configuration after its referenced setup files.
  const files = current.files.filter(file => file.action === 'create')
    .sort((left, right) => Number(left.path.endsWith('/devcontainer.json')) - Number(right.path.endsWith('/devcontainer.json')))
    .map(file => ({ path: file.path, beforeHash: file.beforeHash, afterHash: file.afterHash, content: Buffer.from(file.content).toString('base64') }))
  const unchanged = current.files.filter(file => file.action === 'unchanged').map(file => ({ path: file.path, hash: file.afterHash }))
  await writeFileTransaction(current.workspaceDir, files, {
    verify: () => assertInputs(current.workspaceDir, [...current.inputs, ...unchanged]),
  })
  return { status: 'applied', workspaceDir: current.workspaceDir, files: files.map(file => file.path) }
}

export async function applyDevContainerPlan(cwd: string, plan: DevContainerPlan): Promise<DevContainerResult> {
  if (!plan || plan.schemaVersion !== 1 || plan.kind !== 'devcontainer' || plan.status !== 'ready') {
    throw new Error('Apply requires a ready Dev Container plan.')
  }
  const { fingerprint, ...payload } = plan
  if (hash(JSON.stringify(payload)) !== fingerprint) {
    throw new Error('Dev Container plan was edited; generate a fresh plan.')
  }
  const current = await planDevContainer(cwd, { nodeVersion: plan.nodeVersion })
  if (current.workspaceDir !== plan.workspaceDir) {
    throw new Error('Dev Container workspace changed; generate a fresh plan.')
  }
  return withOperationLock(current.workspaceDir, 'devcontainer', () => apply(cwd, plan))
}
