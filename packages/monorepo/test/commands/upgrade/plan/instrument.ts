import type { UpgradePlan } from '@icebreakers/monorepo'
import { execFile } from 'node:child_process'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import path from 'pathe'

export const transactionId = '00000000-0000-4000-8000-000000000000'

/** Fault injection runs against the published entrypoint in a separate process. */
export async function instrument(plan: UpgradePlan, hook: string, action = 'await applyUpgradePlan(plan.cwd, plan)') {
  const script = `
    import fs from 'node:fs/promises'
    import crypto from 'node:crypto'
    import path from 'node:path'
    import { syncBuiltinESMExports } from 'node:module'
    const [entry, serialized] = process.argv.slice(1)
    const plan = JSON.parse(serialized)
    const root = plan.rootDir
    crypto.randomUUID = () => '${transactionId}'
    ${hook}
    syncBuiltinESMExports()
    const { applyUpgradePlan } = await import(entry)
    try { ${action}; process.stdout.write('applied') }
    catch (error) { process.stdout.write(error.message) }
  `
  return (await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script, pathToFileURL(path.resolve(import.meta.dirname, '../../../../dist/index.mjs')).href, JSON.stringify(plan)], { timeout: 30000 })).stdout
}
