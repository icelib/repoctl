import type { DoctorOptions } from '../../../types/doctor'
import type { DoctorFixOperation, DoctorFixPlan, DoctorFixResult } from './types'
import { realpath } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import { findWorkspaceDir } from '@pnpm/find-workspace-dir'
import path from 'pathe'
import { stageFileTransaction } from '../../../core/file-transaction'
import { record, safeFile } from '../../deps/files'
import { runDoctor } from '../index'
import { readDoctorManifest } from './files'
import { planMissingRootScripts } from './scripts'

async function root(cwd: string) {
  return path.normalize(await realpath(await findWorkspaceDir(cwd) ?? cwd))
}

export async function planDoctorFix(cwd: string, options: DoctorOptions = {}): Promise<DoctorFixPlan> {
  const report = await runDoctor(cwd, options)
  const workspaceDir = await root(cwd)
  const finding = report.checks.find(check => check.id === 'root-scripts' && check.status !== 'pass' && check.suppression?.state !== 'active')
  if (!finding) {
    return { schemaVersion: 1, workspaceDir, operations: [], notes: [] }
  }
  const { operation, notes } = planMissingRootScripts(await readDoctorManifest(workspaceDir))
  return { schemaVersion: 1, workspaceDir, operations: operation ? [operation] : [], notes }
}

function validatePlan(value: unknown, workspaceDir: string): DoctorFixOperation[] {
  const plan = record(value)
  if (!plan || plan['schemaVersion'] !== 1 || plan['workspaceDir'] !== workspaceDir || !Array.isArray(plan['operations']) || plan['operations'].length > 1) {
    throw new Error('Invalid doctor fix plan or workspace. Generate a new plan.')
  }
  return plan['operations'].map((value: unknown) => {
    const operation = record(value)
    if (!operation || typeof operation['before'] !== 'string') {
      throw new Error('Invalid doctor fix operation.')
    }
    const expected = planMissingRootScripts(operation['before']).operation
    // Re-derive the complete operation. A saved plan cannot add arbitrary scripts,
    // change existing values, choose another path, or smuggle shell commands.
    if (!expected || !isDeepStrictEqual(operation, expected)) {
      throw new Error('Unsupported or modified doctor fix operation. Generate a new plan.')
    }
    return expected
  })
}

export async function applyDoctorFixPlan(cwd: string, plan: DoctorFixPlan): Promise<DoctorFixResult> {
  const workspaceDir = await root(cwd)
  const operations = validatePlan(plan, workspaceDir)
  const updates: Array<{ path: string, original: string, content: string }> = []
  for (const operation of operations) {
    const current = await readDoctorManifest(workspaceDir)
    if (current === operation.after) {
      continue
    }
    if (current !== operation.before) {
      throw new Error(`Doctor fix input changed: ${operation.path}. Generate a new plan.`)
    }
    updates.push({ path: operation.path, original: operation.before, content: operation.after })
  }
  const transaction = await stageFileTransaction(updates, file => safeFile(workspaceDir, file), 'doctor')
  let verification: DoctorFixResult['verification']
  try {
    await transaction.apply()
    verification = await runDoctor(workspaceDir, { rules: ['root-scripts'], suppressions: [] })
  }
  catch (error) {
    const recovery = await transaction.rollback()
    if (recovery.length) {
      throw new AggregateError([error], `Doctor fix or verification failed and rollback was blocked. Current edits were preserved; original recovery files retained: ${recovery.join(', ')}`)
    }
    throw error
  }
  const leftovers = await transaction.cleanup()
  if (leftovers.length) {
    throw new Error(`Doctor fixes were applied; review and remove retained recovery files: ${leftovers.join(', ')}`)
  }
  return { status: updates.length ? 'applied' : 'unchanged', changed: updates.map(update => update.path), verification }
}
