import { constants } from 'node:fs'
import { access, readFile, realpath } from 'node:fs/promises'
import process from 'node:process'
import path from 'pathe'
import { valid } from 'semver'

export type PnpmRuntime
  = | { state: 'observed', version: string, source: string }
    | { state: 'missing', source: string }
    | { state: 'unknown', source: string }

/** Read version evidence without executing package-manager shims or activating Corepack. */
export async function inspectPnpmRuntime(): Promise<PnpmRuntime> {
  const userAgent = process.env['npm_config_user_agent']?.match(/^pnpm\/([^ ]+)/)?.[1]
  if (userAgent && valid(userAgent) && /pnpm/i.test(process.env['npm_execpath'] ?? '')) {
    return { state: 'observed', version: userAgent, source: 'npm_config_user_agent (inherited launch evidence)' }
  }

  const names = process.platform === 'win32' ? ['pnpm.exe', 'pnpm.cmd', 'pnpm.bat', 'pnpm'] : ['pnpm']
  for (const entry of (process.env['PATH'] ?? '').split(process.platform === 'win32' ? ';' : ':')) {
    for (const name of names) {
      const candidate = path.resolve(entry || '.', name)
      try {
        await access(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK)
      }
      catch {
        continue
      }
      try {
        let dir = path.dirname(await realpath(candidate))
        // Node package launchers live in the package root or its bin directory.
        for (let depth = 0; depth < 3; depth++) {
          try {
            const pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8')) as { name?: string, version?: string }
            if (pkg.name === 'pnpm' && pkg.version && valid(pkg.version)) {
              return { state: 'observed', version: pkg.version, source: `PATH package metadata: ${candidate}` }
            }
            if (pkg.name === 'corepack') {
              return { state: 'unknown', source: `Corepack shim: ${candidate}` }
            }
          }
          catch { /* A launcher need not have a package manifest. */ }
          dir = path.dirname(dir)
        }
      }
      catch { /* Unreadable command metadata cannot establish a version. */ }
      return { state: 'unknown', source: `Unrecognized pnpm launcher: ${candidate}` }
    }
  }
  return { state: 'missing', source: 'PATH' }
}
