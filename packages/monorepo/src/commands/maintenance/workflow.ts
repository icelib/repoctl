import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { packageDir } from '../../constants'
import { loadMonorepoConfigDetails } from '../../core/config'
import { getAssetTargets } from '../upgrade/targets'

/** Export an opt-in workflow. The publisher embeds trusted code and never imports workspace scripts. */
export async function getMaintenanceWorkflow(cwd?: string): Promise<string> {
  const directory = path.join(packageDir, 'resources/maintenance')
  const [template, validator, presets] = await Promise.all([
    readFile(path.join(directory, 'workflow.yml'), 'utf8'),
    readFile(path.join(directory, 'validate.mjs'), 'utf8'),
    readFile(path.join(directory, 'presets.mjs'), 'utf8'),
  ])
  const loaded = cwd ? await loadMonorepoConfigDetails(cwd, { refresh: true }) : undefined
  const policy = loaded?.presets.layers.flatMap(layer => (layer.manifest.assets ?? []).map(asset => ({ packageName: layer.source.packageName, source: asset.source, target: asset.target }))) ?? []
  const script = `${presets.replace('export function', 'function')}\n${validator.replace(/^import .*\n/u, '').replace('export async function', 'async function')}`.trimEnd()
  return template.replace('            __VALIDATOR__', () => script.split('\n').map(line => `            ${line}`).join('\n'))
    .replace('__TARGETS__', () => JSON.stringify(getAssetTargets()))
    .replace('__PRESET_ASSETS__', () => JSON.stringify(policy))
}
