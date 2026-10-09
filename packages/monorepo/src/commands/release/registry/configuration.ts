import type { ReleaseOptions } from '../types'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import Config from '@npmcli/config'
import definitionsModule from '@npmcli/config/lib/definitions/index.js'
import path from 'pathe'
import { getWorkspacePackages } from '../../../core/workspace'
import { getReleaseEnv } from '../shared'

const require = createRequire(import.meta.url)

export async function registryConfiguration(options: ReleaseOptions) {
  const config = new Config({ ...definitionsModule, npmPath: path.dirname(require.resolve('@npmcli/config/package.json')), argv: [], cwd: options.cwd, env: getReleaseEnv(options) })
  await config.load()
  const access = new Map(await Promise.all((await getWorkspacePackages(options.cwd)).map(async (pkg) => {
    const manifest = JSON.parse(await readFile(pkg.pkgJsonPath, 'utf8')) as { publishConfig?: { access?: string } }
    return [pkg.manifest.name, manifest.publishConfig?.access] as const
  })))
  return (name: string) => {
    const scope = name.startsWith('@') ? name.split('/')[0] : undefined
    const registry = String((scope ? config.flat[`${scope}:registry`] : undefined) ?? config.flat['registry'])
    const authenticated = Object.entries(config.flat).some(([key, value]) => /(?:^|:)(?:_authToken|_auth|_password|username|certfile|keyfile)$/.test(key) && Boolean(value))
    const configuredTransport = ['proxy', 'httpsProxy', 'ca', 'cert', 'key', 'localAddress'].some(key => Boolean(config.flat[key])) || config.flat['strictSSL'] === false
    // Never send credentials using the public fast path, or reinterpret custom transport settings.
    return registry.replace(/\/$/, '') === 'https://registry.npmjs.org'
      && access.get(name) !== 'restricted' && !configuredTransport
      && !authenticated
  }
}
