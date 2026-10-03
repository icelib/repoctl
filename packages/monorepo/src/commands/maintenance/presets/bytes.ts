import type { OrganizationPresetAssetPlan } from '../../../core/presets/asset-plan/types'
import type { MaintenancePresetUpgrade } from '../types'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { digest, maintenanceGit } from '../process'

/** Capture exact working preconditions before applying; publication checks their Git identities. */
export async function capturePresetCheckout(cwd: string, plan: OrganizationPresetAssetPlan): Promise<NonNullable<MaintenancePresetUpgrade['checkout']>> {
  const autocrlf = maintenanceGit(cwd, ['config', '--get', '--type=bool-or-str', '--default', 'false', 'core.autocrlf']).trim()
  const eol = maintenanceGit(cwd, ['config', '--get', '--default', 'native', 'core.eol']).trim().toLowerCase()
  if (!['false', 'true', 'input'].includes(autocrlf) || !['native', 'lf', 'crlf'].includes(eol)) {
    throw new Error('Unsupported Git checkout conversion settings for preset maintenance.')
  }
  const before = []
  for (const file of plan.files.flatMap(file => [file, ...(file.baseline ? [file.baseline] : [])])) {
    const content = await readFile(path.join(cwd, file.path))
    if (digest(content) !== file.beforeHash) {
      throw new Error(`Preset precondition changed before capture: ${file.path}`)
    }
    before.push({ path: file.path, content: content.toString('base64') })
  }
  return { autocrlf: autocrlf as 'false' | 'true' | 'input', eol: eol as 'native' | 'lf' | 'crlf', before }
}
