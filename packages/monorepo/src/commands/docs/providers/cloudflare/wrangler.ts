import { access, readFile, realpath, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'pathe'
import { isRecord } from '../../../../core/config/validation/schema'
import { cloudflareApiOrigin, versionPattern } from './client'
import { assertContainedPath, contained } from './paths'

/** Unset alternate credentials and CI identity overrides; empty values can still override Wrangler config. */
export function wranglerEnvironment(env: NodeJS.ProcessEnv, accountId: string, environment: string, output: string) {
  const result: NodeJS.ProcessEnv = {
    ...env,
    CLOUDFLARE_ACCOUNT_ID: accountId,
    CLOUDFLARE_API_BASE_URL: cloudflareApiOrigin,
    CLOUDFLARE_ENV: environment,
    WRANGLER_OUTPUT_FILE_PATH: output,
  }
  delete result['CLOUDFLARE_API_KEY']
  delete result['CF_API_KEY']
  delete result['WRANGLER_CI_OVERRIDE_NAME']
  return result
}

/** Resolve the installed package directly; pnpm exec alone may fall through to a global PATH binary. */
export async function localWrangler(source: string, configFile: string) {
  let manifestPath: string
  try {
    manifestPath = createRequire(path.join(path.dirname(configFile), 'package.json')).resolve('wrangler/package.json')
    await assertContainedPath(source, manifestPath)
  }
  catch {
    throw new Error('Declare Wrangler in this workspace and install it with the frozen lockfile before deployment')
  }
  const physical = await realpath(manifestPath)
  if (!contained(await realpath(source), physical) || !path.normalize(physical).split('/').includes('node_modules')) {
    throw new Error('Wrangler must resolve from the frozen checkout node_modules')
  }
  const manifest: unknown = JSON.parse(await readFile(manifestPath, 'utf8'))
  const bin = isRecord(manifest) && isRecord(manifest['bin']) ? manifest['bin']['wrangler'] : undefined
  if (!isRecord(manifest) || manifest['name'] !== 'wrangler' || typeof bin !== 'string') {
    throw new Error('The installed Wrangler package does not declare its CLI')
  }
  const filename = path.resolve(path.dirname(manifestPath), bin)
  await assertContainedPath(source, filename)
  await access(filename)
  return filename
}

export async function readWranglerVersion(filename: string, worker: string, environment: string) {
  if ((await stat(filename)).size > 1_048_576) {
    throw new Error('Wrangler deployment output exceeds the verification limit')
  }
  let entries: unknown[]
  try {
    entries = (await readFile(filename, 'utf8')).split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line))
  }
  catch {
    throw new Error('Wrangler did not produce valid deployment output; retry the same deployment')
  }
  const deployments = entries.filter(entry => isRecord(entry) && entry['type'] === 'deploy')
  const versions = new Set<string>()
  for (const entry of deployments) {
    if (!isRecord(entry) || entry['version'] !== 1 || entry['worker_name'] !== worker || (entry['wrangler_environment'] === undefined ? '' : entry['wrangler_environment']) !== environment
      || typeof entry['version_id'] !== 'string' || !versionPattern.test(entry['version_id'])) {
      throw new Error('Wrangler deployment output does not match the frozen Worker and environment')
    }
    versions.add(entry['version_id'])
  }
  if (versions.size !== 1) {
    throw new Error('Wrangler did not report exactly one deployed version')
  }
  return [...versions][0]!
}
