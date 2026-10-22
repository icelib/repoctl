import type { UpgradePlan } from '@icebreakers/monorepo'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
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
    const [entry, planFile] = process.argv.slice(2)
    const plan = JSON.parse(await fs.readFile(planFile, 'utf8'))
    const root = plan.rootDir
    crypto.randomUUID = () => '${transactionId}'
    ${hook}
    syncBuiltinESMExports()
    const { applyUpgradePlan } = await import(entry)
    try { ${action}; process.stdout.write('applied') }
    catch (error) { process.stdout.write(error.message) }
  `
  // Plans contain complete migration journals and can exceed OS argv limits.
  // Keep transport files outside the workspace used by read-only assertions.
  const directory = await mkdtemp(path.join(tmpdir(), 'repoctl-upgrade-instrument-'))
  try {
    const scriptFile = path.join(directory, 'instrument.mjs')
    const planFile = path.join(directory, 'plan.json')
    await writeFile(scriptFile, script)
    await writeFile(planFile, JSON.stringify(plan))
    return (await promisify(execFile)(process.execPath, [scriptFile, pathToFileURL(path.resolve(import.meta.dirname, '../../../../dist/index.mjs')).href, planFile], { timeout: 30000 })).stdout
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
}
