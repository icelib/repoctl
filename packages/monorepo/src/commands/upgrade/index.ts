import type { CliOpts, PackageJson } from '../../types'
import type { PendingOverwrite } from './overwrite'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import { checkbox, ensureTemplateAssetsPrepared } from '@icebreakers/monorepo-templates'
import klaw from 'klaw'
import path from 'pathe'
import YAML from 'yaml'
import fs from '@/utils/fs'
import { assetsDir } from '../../constants'
import { resolveCommandConfig } from '../../core/config'
import { GitClient } from '../../core/git'
import { logger } from '../../core/logger'
import { localize } from '../../i18n'
import { escapeStringRegexp, isIgnorableFsError, isMatch, toWorkspaceAssetPath, updateIssueTemplateConfig } from '../../utils'
import { migrateLegacyToolingReferences } from '../tooling-migration'
import { isAgentsMarkdownEquivalent, mergeAgentsMarkdown } from './agents'
import { evaluateWriteIntent, flushPendingOverwrites, scheduleOverwrite } from './overwrite'
import { setPkgJson } from './pkg-json'
import { classifyReleaseWorkflow, migrateLegacyVersioning } from './release-migration'
import { getAssetTargets } from './targets'
import { isTextEquivalent, mergeGitignore } from './text'
import { mergeWorkspaceManifest, normalizeWorkspaceManifest } from './workspace'

export { setPkgJson }

/**
 * 将 assets 目录的模版文件同步到工程中，实现一键升级脚手架能力。
 */
export async function upgradeMonorepo(opts: CliOpts) {
  await ensureTemplateAssetsPrepared()
  const cwd = opts.cwd ?? process.cwd()
  const upgradeConfig = await resolveCommandConfig('upgrade', cwd)
  const merged: CliOpts = {
    cwd,
    outDir: '',
    ...(upgradeConfig ?? {}),
    ...opts,
  }

  const outDir = merged.outDir ?? ''
  const absOutDir = path.isAbsolute(outDir) ? outDir : path.join(cwd, outDir)
  const gitClient = new GitClient({
    baseDir: cwd,
  })
  const repoName = await gitClient.getRepoName()
  // 默认从 assets 目录读取一组标准文件作为升级目标。
  const useCoreAssets = merged.core ?? false
  merged.core = useCoreAssets
  const baseTargets = getAssetTargets(useCoreAssets)
  const configTargets = upgradeConfig?.targets ?? []
  const mergeTargets = upgradeConfig?.mergeTargets
  let targets = configTargets.length
    ? (mergeTargets === false ? [...configTargets] : [...new Set([...baseTargets, ...configTargets])])
    : baseTargets

  if (merged.interactive) {
    // 交互模式允许用户临时调整需要覆盖的文件集合。
    // https://github.com/pnpm/pnpm/blob/db420ab592666dbae77fdda3f5c04ed2c045846d/pkg-manager/plugin-commands-installation/src/update/index.ts
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      logger.info(localize('Skipped interactive target selection in non-interactive mode.', '非交互模式下跳过交互式目标选择。'))
    }
    else {
      targets = await checkbox({
        message: localize('Select the files you need', '选择你需要的文件'),
        choices: targets.map((x) => {
          return {
            value: x,
            checked: true,
          }
        }),
      })
    }
  }

  const regexpArr = targets.map((x) => {
    return new RegExp(`^${escapeStringRegexp(x)}`)
  })
  // 旧版本默认跳过 pnpm change intent Markdown，可通过配置覆盖。
  const skipChangesetMarkdown = upgradeConfig?.skipChangesetMarkdown ?? true
  const scriptOverrides = upgradeConfig?.scripts
  const skipOverwrite = merged.noOverwrite ? true : merged.skipOverwrite
  const buildWriteIntentOptions = (source: string | Buffer) => {
    return skipOverwrite === undefined ? { source } : { skipOverwrite, source }
  }
  const pendingOverwrites: PendingOverwrite[] = []
  for await (const file of klaw(assetsDir, {
    filter(p) {
      const rel = toWorkspaceAssetPath(path.relative(assetsDir, p))
      return isMatch(rel, regexpArr)
    },
  })) {
    if (!file.stats.isFile()) {
      continue
    }

    const relPath = toWorkspaceAssetPath(path.relative(assetsDir, file.path))

    if (skipChangesetMarkdown && relPath.startsWith('.changeset/') && relPath.endsWith('.md')) {
      continue
    }
    const targetPath = path.resolve(absOutDir, relPath)

    if (relPath === '.github/workflows/release.yml' && await fs.pathExists(targetPath)) {
      const workflowStatus = await classifyReleaseWorkflow(absOutDir)
      if (workflowStatus === 'custom' && !merged.overwriteRelease) {
        logger.warn(localize('Skipped custom release workflow; use repo upgrade --overwrite-release to replace it.', '已跳过自定义发布工作流；如需替换，请使用 repo upgrade --overwrite-release。'))
        continue
      }
    }

    try {
      if (relPath === 'package.json') {
        if (!await fs.pathExists(targetPath)) {
          continue
        }

        const sourcePkgJson = await fs.readJson(file.path) as PackageJson
        const targetPkgJson = await fs.readJson(targetPath) as PackageJson
        setPkgJson(sourcePkgJson, targetPkgJson, scriptOverrides ? { scripts: scriptOverrides } : undefined)
        // 直接覆写对象后重新序列化，保证键顺序与缩进一致。
        const data = `${JSON.stringify(targetPkgJson, undefined, 2)}\n`
        const intent = await evaluateWriteIntent(targetPath, buildWriteIntentOptions(data))
        const action = async () => {
          await fs.outputFile(targetPath, data, 'utf8')
          logger.success(targetPath)
        }
        await scheduleOverwrite(intent, {
          relPath,
          targetPath,
          action,
          pending: pendingOverwrites,
        })
        continue
      }

      if (relPath === 'pnpm-workspace.yaml') {
        const sourceManifest = normalizeWorkspaceManifest(
          YAML.parse(await fs.readFile(file.path, 'utf8')),
        )
        const exists = await fs.pathExists(targetPath)
        const targetManifest = exists
          ? normalizeWorkspaceManifest(YAML.parse(await fs.readFile(targetPath, 'utf8')))
          : normalizeWorkspaceManifest({})
        const mergedManifest = exists
          ? mergeWorkspaceManifest(sourceManifest, targetManifest)
          : sourceManifest
        const data = YAML.stringify(mergedManifest, { singleQuote: true })
        const intent = await evaluateWriteIntent(targetPath, buildWriteIntentOptions(data))
        const action = async () => {
          await fs.outputFile(targetPath, data, 'utf8')
          logger.success(targetPath)
        }
        await scheduleOverwrite(intent, {
          relPath,
          targetPath,
          action,
          pending: pendingOverwrites,
        })
        continue
      }

      if (relPath === '.gitignore') {
        const source = await fs.readFile(file.path, 'utf8')
        const exists = await fs.pathExists(targetPath)
        const target = exists ? await fs.readFile(targetPath, 'utf8') : ''
        const data = exists ? mergeGitignore(source, target) : source
        if (exists && isTextEquivalent(target, data)) {
          continue
        }
        const intent = await evaluateWriteIntent(targetPath, buildWriteIntentOptions(data))
        const action = async () => {
          await fs.outputFile(targetPath, data, 'utf8')
          logger.success(targetPath)
        }
        await scheduleOverwrite(intent, {
          relPath,
          targetPath,
          action,
          pending: pendingOverwrites,
        })
        continue
      }

      if (relPath === 'AGENTS.md') {
        const source = await fs.readFile(file.path, 'utf8')
        const exists = await fs.pathExists(targetPath)
        const target = exists ? await fs.readFile(targetPath, 'utf8') : ''
        const data = exists ? mergeAgentsMarkdown(source, target) : source
        if (exists && isAgentsMarkdownEquivalent(target, data)) {
          continue
        }
        const intent = await evaluateWriteIntent(targetPath, buildWriteIntentOptions(data))
        const action = async () => {
          await fs.outputFile(targetPath, data, 'utf8')
          logger.success(targetPath)
        }
        await scheduleOverwrite(intent, {
          relPath,
          targetPath,
          action,
          pending: pendingOverwrites,
        })
        continue
      }

      if (relPath === 'LICENSE') {
        const source = await fs.readFile(file.path)
        const intent = await evaluateWriteIntent(targetPath, { skipOverwrite: true, source })
        const action = async () => {
          await fs.outputFile(targetPath, source)
          logger.success(targetPath)
        }
        await scheduleOverwrite(intent, {
          relPath,
          targetPath,
          action,
          pending: pendingOverwrites,
        })
        continue
      }

      if (relPath === '.github/ISSUE_TEMPLATE/config.yml') {
        const source = await fs.readFile(file.path, 'utf8')
        const data = updateIssueTemplateConfig(source, repoName)
        const intent = await evaluateWriteIntent(targetPath, buildWriteIntentOptions(data))
        const action = async () => {
          await fs.outputFile(targetPath, data)
          logger.success(targetPath)
        }
        await scheduleOverwrite(intent, {
          relPath,
          targetPath,
          action,
          pending: pendingOverwrites,
        })
        continue
      }

      let source = await fs.readFile(file.path)
      if (/\.(?:js|mjs|ts|mts|cjs|cts)$/.test(relPath)) {
        const exists = await fs.pathExists(targetPath)
        const textSource = exists ? await fs.readFile(targetPath, 'utf8') : source.toString('utf8')
        const migrated = migrateLegacyToolingReferences(textSource, 'repoctl/tooling')
        source = Buffer.from(migrated === textSource ? migrateLegacyToolingReferences(source.toString('utf8'), 'repoctl/tooling') : migrated)
      }
      const action = async () => {
        await fs.outputFile(targetPath, source)
        logger.success(targetPath)
      }

      const forceReleaseWorkflow = relPath === '.github/workflows/release.yml'
        && merged.overwriteRelease === true
      const intent = await evaluateWriteIntent(
        targetPath,
        forceReleaseWorkflow ? { source } : buildWriteIntentOptions(source),
      )
      if (forceReleaseWorkflow && intent.type !== 'skip') {
        await action()
        continue
      }
      await scheduleOverwrite(intent, {
        relPath,
        targetPath,
        action,
        pending: pendingOverwrites,
      })
    }
    catch (error) {
      if (isIgnorableFsError(error)) {
        continue
      }
      throw error
    }
  }

  await flushPendingOverwrites(pendingOverwrites, {
    ...(merged.yes !== undefined ? { yes: merged.yes } : {}),
    ...(merged.overwrite !== undefined ? { overwrite: merged.overwrite } : {}),
    ...(merged.noOverwrite !== undefined ? { noOverwrite: merged.noOverwrite } : {}),
  })

  await migrateLegacyVersioning(absOutDir)
}
