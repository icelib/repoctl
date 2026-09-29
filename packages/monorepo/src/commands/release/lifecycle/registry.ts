import type { PublishedPackage, ReleaseOptions } from '../types'
import { spawnSync } from 'node:child_process'
import { ReleaseCommandError } from '../errors'
import { sleep } from '../publish/registry'
import { packageKey } from '../publish/state'
import { getReleaseEnv } from '../shared'

export interface RegistryVersion {
  'version': string
  'gitHead'?: string
  'dist-tags'?: Record<string, string>
}

/** 明确的 E404 才代表不存在；其余失败不能作为重新上传的依据。 */
export async function inspectRegistry(pkg: PublishedPackage, options: ReleaseOptions): Promise<RegistryVersion | undefined> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = (options.spawn ?? spawnSync)('npm', ['view', packageKey(pkg), '--json'], {
      cwd: options.cwd,
      env: getReleaseEnv(options),
      encoding: 'utf8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10_000,
      killSignal: 'SIGKILL',
    })
    const output = `${String(result.stdout ?? '')}
${String(result.stderr ?? '')}`
    if (result.status === 0) {
      try {
        const data = JSON.parse(String(result.stdout)) as RegistryVersion
        if (data.version === pkg.version) {
          return data
        }
      }
      catch {}
      throw new ReleaseCommandError(`npm returned invalid metadata for ${packageKey(pkg)}; registry state is unknown`)
    }
    if (/\bE404\b/.test(output) && !result.error) {
      return undefined
    }
    if (/\b(?:E401|E403|ENEEDAUTH)\b/.test(output)) {
      throw new ReleaseCommandError(`npm authentication failed for ${packageKey(pkg)}`)
    }
    if (attempt < 2) {
      await sleep(1_000 * 2 ** attempt, options)
    }
  }
  throw new ReleaseCommandError(`npm registry state is unknown for ${packageKey(pkg)} after bounded retries; no upload attempted`)
}
