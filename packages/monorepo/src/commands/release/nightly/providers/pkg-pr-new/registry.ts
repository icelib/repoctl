import type { NightlyOptions, NightlyPackage, NightlyReport } from '../../types'
import { createHash } from 'node:crypto'
import { createPackageFromTarballData } from '@arethetypeswrong/core'
import { matchesSnapshotMetadata } from '../../../snapshot/identity'

export const pkgPrNewLocator = (repository: string, name: string, commit: string) => `https://pkg.pr.new/${repository}/${name}@${commit}`

export async function downloadPkgPrNew(pkg: NightlyPackage, report: NightlyReport, options: NightlyOptions) {
  let response: Response
  try {
    response = await (options.registryFetch ?? fetch)(pkg.locator, { signal: AbortSignal.timeout(30_000), headers: { accept: 'application/octet-stream' } })
  }
  catch {
    throw new Error(`pkg.pr.new request failed for ${pkg.name}; publication state is unknown.`)
  }
  if (response.status === 404) {
    return null
  }
  if (!response.ok) {
    throw new Error(`pkg.pr.new returned HTTP ${response.status} for ${pkg.name}; publication state is unknown.`)
  }
  if (Number(response.headers.get('content-length') ?? 0) > 100 * 1024 * 1024) {
    throw new Error(`pkg.pr.new artifact exceeds the download limit for ${pkg.name}.`)
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > 100 * 1024 * 1024) {
    throw new Error(`pkg.pr.new artifact exceeds the download limit for ${pkg.name}.`)
  }
  const packed = createPackageFromTarballData(bytes)
  const manifest = JSON.parse(packed.readFile(`/node_modules/${packed.packageName}/package.json`))
  if (manifest.name !== pkg.name || manifest.version !== pkg.version || !matchesSnapshotMetadata(manifest.repoctlSnapshot, report.snapshot!)) {
    throw new Error(`pkg.pr.new artifact identity conflicts for ${pkg.name}; existing commit URLs cannot be overwritten.`)
  }
  return `sha512-${createHash('sha512').update(bytes).digest('base64')}`
}

export async function inspectPkgPrNew(report: NightlyReport, options: NightlyOptions) {
  report.existing = {}
  for (const pkg of report.packages) {
    const integrity = await downloadPkgPrNew(pkg, report, options)
    if (integrity) {
      report.existing[pkg.name] = integrity
    }
  }
  return Object.keys(report.existing).length === report.packages.length
}
