import type { TemplateLinkOptions } from './types'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { captureTemplateSnapshot, getTemplateDefinition, packageDir, prepareTemplateInstanceSource, readTemplatePackageVersion, safeInstancePath, scaffoldTemplate, snapshotDigest } from '@icebreakers/monorepo-templates'
import path from 'pathe'
import fs from '@/utils/fs'
import { renderCreateNewProject } from '../create/render'

export async function renderHistoricalTemplate(options: TemplateLinkOptions) {
  const sourcePackageDir = options.sourceDir ? path.resolve(options.cwd, options.sourceDir) : packageDir
  const definition = getTemplateDefinition(options.template) ?? { source: options.template, target: options.target }
  let actualVersion: string
  try {
    actualVersion = await readTemplatePackageVersion(sourcePackageDir)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }
    throw error
  }
  if (actualVersion !== options.version) {
    if (options.sourceDir) {
      throw new Error(`Historical template package version is ${actualVersion}, not requested ${options.version}.`)
    }
    return undefined
  }
  const sourceDir = await safeInstancePath(sourcePackageDir, `templates/${definition.source}`)
  if (!await fs.pathExists(sourceDir)) {
    return undefined
  }
  const original = await prepareTemplateInstanceSource(sourceDir, sourcePackageDir)
  const isolated = await mkdtemp(path.join(tmpdir(), 'repoctl-template-baseline-'))
  try {
    const targetDir = path.join(isolated, options.target)
    await fs.ensureDir(targetDir)
    if (options.profile === 'workspace-copy-v1') {
      await scaffoldTemplate({ sourceDir, targetDir })
    }
    else {
      const renameJson = options.parameters?.renameJson ?? false
      await renderCreateNewProject({
        cwd: isolated,
        sourceDir,
        targetDir,
        targetName: options.target,
        targetExists: false,
        template: options.template,
        requestedTemplate: options.template,
        usedFallback: false,
        hasPackageJson: await fs.pathExists(path.join(sourceDir, 'package.json')),
        packageName: options.parameters?.packageName ?? path.basename(options.target),
        packageJsonFileName: renameJson ? 'package.mock.json' : 'package.json',
        renameJson,
        templateDefinition: definition,
      }, false)
    }
    const after = await captureTemplateSnapshot(sourceDir)
    if (snapshotDigest(after) !== snapshotDigest(original.snapshot)) {
      throw new Error('Historical template source changed during baseline rendering.')
    }
    return { original, rendered: await captureTemplateSnapshot(targetDir) }
  }
  finally {
    await rm(isolated, { recursive: true, force: true })
  }
}
