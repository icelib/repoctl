import type { PreparedTemplateSource } from './types'
import fs from 'node:fs/promises'
import path from 'node:path'
import { packageDir, templatesDir } from '../paths'
import { ensureTemplateAssetsPrepared } from '../runtime-assets'
import { safeInstancePath } from './paths'
import { exactVersionPattern } from './schema'
import { captureTemplateSnapshot, snapshotDigest } from './snapshot'

export async function readTemplatePackageVersion(sourcePackageDir = packageDir) {
  const stat = await fs.lstat(sourcePackageDir)
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('Historical template package root must be a real directory, not a link.')
  }
  const manifestPath = await safeInstancePath(sourcePackageDir, 'package.json')
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as { name?: string, version?: string }
  if (manifest.name !== '@icebreakers/monorepo-templates' || !exactVersionPattern.test(manifest.version ?? '')) {
    throw new Error('Historical source must be an extracted @icebreakers/monorepo-templates package with an exact version.')
  }
  return manifest.version!
}

export async function prepareTemplateInstanceSource(sourceDir: string, historicalPackageDir?: string): Promise<PreparedTemplateSource> {
  const sourcePackageDir = historicalPackageDir ?? packageDir
  if (historicalPackageDir) {
    await readTemplatePackageVersion(historicalPackageDir)
    const root = await fs.realpath(historicalPackageDir)
    const lexical = path.resolve(sourceDir).startsWith(`${path.resolve(historicalPackageDir)}${path.sep}`) ? path.resolve(historicalPackageDir) : root
    const relative = path.relative(lexical, path.resolve(sourceDir)).split(path.sep).join('/')
    sourceDir = await safeInstancePath(historicalPackageDir, relative)
  }
  if (!historicalPackageDir && path.resolve(sourceDir).startsWith(`${path.resolve(templatesDir)}${path.sep}`)) {
    await ensureTemplateAssetsPrepared()
  }
  const relative = path.relative(await fs.realpath(sourcePackageDir), await fs.realpath(sourceDir)).split(path.sep).join('/')
  const packaged = relative.startsWith('templates/') && !relative.includes('../')
  if (historicalPackageDir && !packaged) {
    throw new Error('Historical template source escapes the selected package.')
  }
  if (packaged) {
    await safeInstancePath(sourcePackageDir, relative)
  }
  const snapshot = await captureTemplateSnapshot(sourceDir)
  return {
    source: packaged
      ? { kind: 'package', packageName: '@icebreakers/monorepo-templates', version: await readTemplatePackageVersion(sourcePackageDir), templatePath: relative, digest: snapshotDigest(snapshot) }
      : { kind: 'snapshot', templatePath: 'template', digest: snapshotDigest(snapshot) },
    snapshot,
  }
}
