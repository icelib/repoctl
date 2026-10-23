import { access, readFile, realpath, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'pathe'
import { isRecord } from '../../../../core/config/validation/schema'
import { assertContainedPath, contained } from '../../artifacts/paths'
import { DocsDiagnosticError } from '../../diagnostics'
import { versionPattern } from './client'

/** Resolve the installed package directly; pnpm exec alone may fall through to a global PATH binary. */
export async function localWrangler(source: string, configFile: string) {
  let manifestPath: string
  try {
    manifestPath = createRequire(path.join(path.dirname(configFile), 'package.json')).resolve('wrangler/package.json')
    await assertContainedPath(source, manifestPath)
  }
  catch {
    throw new DocsDiagnosticError('wrangler-missing')
  }
  const physical = await realpath(manifestPath)
  if (!contained(await realpath(source), physical) || !path.normalize(physical).split('/').includes('node_modules')) {
    throw new DocsDiagnosticError('wrangler-invalid')
  }
  const manifest: unknown = JSON.parse(await readFile(manifestPath, 'utf8'))
  const bin = isRecord(manifest) && isRecord(manifest['bin']) ? manifest['bin']['wrangler'] : undefined
  if (!isRecord(manifest) || manifest['name'] !== 'wrangler' || typeof bin !== 'string') {
    throw new DocsDiagnosticError('wrangler-invalid')
  }
  const filename = path.resolve(path.dirname(manifestPath), bin)
  await assertContainedPath(source, filename)
  await access(filename)
  return filename
}

export async function readWranglerVersion(filename: string, worker: string, environment: string) {
  if ((await stat(filename)).size > 1_048_576) {
    throw new DocsDiagnosticError('wrangler-result-invalid')
  }
  let entries: unknown[]
  try {
    entries = (await readFile(filename, 'utf8')).split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line))
  }
  catch {
    throw new DocsDiagnosticError('wrangler-result-invalid')
  }
  const deployments = entries.filter(entry => isRecord(entry) && entry['type'] === 'deploy')
  const versions = new Set<string>()
  for (const entry of deployments) {
    if (!isRecord(entry) || entry['version'] !== 1 || entry['worker_name'] !== worker || (entry['wrangler_environment'] === undefined ? '' : entry['wrangler_environment']) !== environment
      || typeof entry['version_id'] !== 'string' || !versionPattern.test(entry['version_id'])) {
      throw new DocsDiagnosticError('wrangler-result-invalid')
    }
    versions.add(entry['version_id'])
  }
  if (versions.size !== 1) {
    throw new DocsDiagnosticError('wrangler-result-invalid')
  }
  return [...versions][0]!
}
