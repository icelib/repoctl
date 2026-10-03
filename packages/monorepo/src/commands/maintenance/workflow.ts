import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { packageDir } from '../../constants'
import { getAssetTargets } from '../upgrade/targets'

/** Export an opt-in workflow. The publisher embeds trusted code and never imports workspace scripts. */
export async function getMaintenanceWorkflow(): Promise<string> {
  const directory = path.join(packageDir, 'resources/maintenance')
  const [template, validator] = await Promise.all([
    readFile(path.join(directory, 'workflow.yml'), 'utf8'),
    readFile(path.join(directory, 'validate.mjs'), 'utf8'),
  ])
  const script = validator.replace('export async function', 'async function').trimEnd()
  return template.replace('            __VALIDATOR__', () => script.split('\n').map(line => `            ${line}`).join('\n'))
    .replace('__TARGETS__', () => JSON.stringify(getAssetTargets()))
}
