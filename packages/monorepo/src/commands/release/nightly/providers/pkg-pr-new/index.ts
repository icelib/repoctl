import type { NightlyOptions, NightlyReport } from '../../types'
import { createHash } from 'node:crypto'
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { setTimeout } from 'node:timers/promises'
import { isolatedSnapshotEnvironment } from '../../../snapshot/process'
import { nightlyCommand } from '../../process'
import { downloadPkgPrNew } from './registry'

interface UploadResult { packages?: { name: string, url: string, shasum: string }[], templates?: unknown[] }

async function pinnedPublisher() {
  const manifestPath = createRequire(import.meta.url).resolve('pkg-pr-new/package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (manifest.version !== '0.0.91' || typeof manifest.bin?.['pkg-pr-new'] !== 'string') {
    throw new Error('Nightly requires its own pinned pkg-pr-new@0.0.91 dependency.')
  }
  const root = await realpath(path.dirname(manifestPath))
  const executable = await realpath(path.resolve(root, manifest.bin['pkg-pr-new']))
  const relative = path.relative(root, executable)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('pkg-pr-new executable resolved outside its pinned package.')
  }
  return executable
}

export async function publishPkgPrNew(report: NightlyReport, options: NightlyOptions, checkpoint: () => Promise<void>) {
  const snapshot = report.snapshot!
  const missing: typeof snapshot.packages = []
  // Compare every occupied URL before the one allowed upload invocation.
  for (const pkg of snapshot.packages) {
    const locator = report.packages.find(candidate => candidate.name === pkg.name)!
    const integrity = await downloadPkgPrNew(locator, report, options)
    if (integrity && integrity !== pkg.integrity) {
      throw new Error(`pkg.pr.new bytes conflict for ${pkg.name}; the existing full-commit URL will not be overwritten.`)
    }
    if (report.existing?.[pkg.name] && report.existing[pkg.name] !== pkg.integrity) {
      throw new Error(`pkg.pr.new prepared bytes differ from the previously inspected artifact for ${pkg.name}.`)
    }
    pkg.published = Boolean(integrity)
    if (!integrity) {
      missing.push(pkg)
    }
  }
  await checkpoint()
  if (missing.length) {
    const directory = path.join(report.outputDirectory!, 'pkg-pr-new-publication')
    await mkdir(directory)
    await writeFile(path.join(directory, 'package.json'), '{"name":"repoctl-nightly-publication","private":true}\n')
    await writeFile(path.join(directory, 'pnpm-workspace.yaml'), 'packages: []\n')
    const jsonFile = path.join(directory, 'pkg-pr-new.json')
    const executable = await pinnedPublisher()
    nightlyCommand(report, { ...options, cwd: directory, env: isolatedSnapshotEnvironment(options, report.outputDirectory!) }, process.execPath, [executable, 'publish', '--no-compact', '--comment=off', '--no-template', '--json', jsonFile, ...missing.map(pkg => pkg.tarball!)])
    const uploaded = JSON.parse(await readFile(jsonFile, 'utf8')) as UploadResult
    if (!Array.isArray(uploaded.packages) || uploaded.packages.length !== missing.length || uploaded.templates?.length) {
      throw new Error('pkg-pr-new JSON does not describe the exact requested package batch.')
    }
    for (const pkg of missing) {
      const matches = uploaded.packages.filter(item => item.name === pkg.name)
      const locator = report.packages.find(item => item.name === pkg.name)!.locator
      const shasum = createHash('sha1').update(await readFile(pkg.tarball!)).digest('hex')
      if (matches.length !== 1 || matches[0]!.url !== locator || matches[0]!.shasum !== shasum) {
        throw new Error(`pkg-pr-new JSON conflicts with the verified upload for ${pkg.name}.`)
      }
    }
  }
  const deadline = Date.now() + 15 * 60_000
  for (let attempt = 0; attempt < 180; attempt++) {
    const pending: string[] = []
    for (const pkg of snapshot.packages) {
      if (Date.now() >= deadline) {
        throw new Error('Timed out confirming pkg.pr.new publication after 15 minutes.')
      }
      const integrity = await downloadPkgPrNew(report.packages.find(item => item.name === pkg.name)!, report, options)
      if (!integrity) {
        pending.push(pkg.name)
      }
      else if (integrity !== pkg.integrity) {
        throw new Error(`pkg.pr.new downloaded bytes differ from the verified artifact for ${pkg.name}.`)
      }
      else {
        pkg.published = true
      }
    }
    await checkpoint()
    if (!pending.length) {
      snapshot.status = 'published'
      report.confirmed = true
      return
    }
    if (attempt === 179) {
      throw new Error(`pkg.pr.new uploaded packages did not become visible: ${pending.join(', ')}.`)
    }
    await (options.sleep ?? setTimeout)(5000)
  }
}
