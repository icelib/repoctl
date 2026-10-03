import type { TemplateLinkOptions } from './types'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { captureTemplateSnapshot, getTemplateDefinition, packageDir, prepareTemplateInstanceSource, readTemplatePackageVersion, readTemplateParameterManifest, renderTemplateParameters, resolveTemplateParameters, safeInstancePath, scaffoldTemplate, snapshotDigest } from '@icebreakers/monorepo-templates'
import path from 'pathe'
import fs from '@/utils/fs'
import { renderCreateNewProject, rewriteTemplateSnapshotReferences } from '../create/render'

export async function renderHistoricalTemplate(options: TemplateLinkOptions & { excludedPaths?: string[] }) {
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
      let snapshot
      if (options.profile === 'repo-new-parameters-v1') {
        const manifest = readTemplateParameterManifest(original.snapshot)
        if (!manifest) {
          throw new Error('Parameterized template upgrades require an explicit repoctl.template.json contract.')
        }
        const omitted = (file: string) => {
          const generated = file.replace(/(^|\/)gitignore$/u, '$1.gitignore')
          return options.excludedPaths?.some(item => generated === item || generated.startsWith(`${item}/`)) ?? false
        }
        const parameters = Object.fromEntries(Object.entries(manifest.parameters).map(([name, definition]) => [name, definition.sensitive && options.parameters?.sensitiveParameters?.includes(name) ? { ...definition, required: false } : definition]))
        const values = resolveTemplateParameters(parameters, options.parameters?.templateValues ?? {})
        const prepared = rewriteTemplateSnapshotReferences(original.snapshot, targetDir, isolated)
        snapshot = renderTemplateParameters({ ...prepared, files: prepared.files.filter(file => !omitted(file.path)), directories: prepared.directories.filter(directory => !omitted(directory)) }, {
          ...manifest,
          parameters,
          ...(manifest.interpolate ? { interpolate: manifest.interpolate.filter(file => !omitted(file)) } : {}),
          ...(manifest.conditions ? { conditions: manifest.conditions.map(condition => ({ ...condition, ...(condition.files ? { files: condition.files.filter(file => !omitted(file)) } : {}) })) } : {}),
        }, values).snapshot
      }
      await renderCreateNewProject({
        cwd: isolated,
        sourceDir,
        targetDir,
        hasPackageJson: await fs.pathExists(path.join(sourceDir, 'package.json')),
        packageName: options.parameters?.packageName ?? path.basename(options.target),
        packageJsonFileName: renameJson ? 'package.mock.json' : 'package.json',
        ...(snapshot ? { snapshot } : {}),
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
