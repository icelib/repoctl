import type { CliOpts } from '../../types'
import type { PreparedUpgrade, UpgradeOperation, UpgradePlan } from './types'
import process from 'node:process'
import { checkbox, ensureTemplateAssetsPrepared } from '@icebreakers/monorepo-templates'
import klaw from 'klaw'
import path from 'pathe'
import { assetsDir } from '../../constants'
import { resolveCommandConfig } from '../../core/config'
import { GitClient } from '../../core/git'
import { localize } from '../../i18n'
import { toWorkspaceAssetPath } from '../../utils'
import fs from '../../utils/fs'
import { getUpgradeContent } from './content'
import { createUpgradeDiff } from './diff'
import { assertUpgradeParents, readUpgradeFile, sameContent } from './files'
import { addReleaseMigration } from './migration'
import { classifyReleaseWorkflow } from './release-migration'
import { getAssetTargets } from './targets'

export async function prepareUpgrade(opts: CliOpts, selectTargets = false): Promise<PreparedUpgrade> {
  const cwd = path.resolve(opts.cwd ?? process.cwd())
  const config = await resolveCommandConfig('upgrade', cwd)
  const options: CliOpts = { cwd, outDir: '', ...config, ...opts }
  // Commander represents --no-overwrite as overwrite:false.
  options.noOverwrite = options.noOverwrite || options.overwrite === false
  const targetDir = path.resolve(cwd, options.outDir ?? '')
  if (!await fs.pathExists(assetsDir)) {
    throw new Error('Managed template assets are missing; build or reinstall @icebreakers/monorepo-templates first.')
  }
  const baseTargets = getAssetTargets(options.core ?? false)
  let targets = config?.targets?.length
    ? config.mergeTargets === false ? [...config.targets] : [...new Set([...baseTargets, ...config.targets])]
    : baseTargets
  if (selectTargets && options.interactive && process.stdin.isTTY && process.stdout.isTTY) {
    targets = await checkbox({
      message: localize('Select the files you need', '选择你需要的文件'),
      choices: targets.map(value => ({ value, checked: true })),
    })
  }
  const repoName = await new GitClient({ baseDir: cwd }).getRepoName()
  const operations: UpgradeOperation[] = []
  for await (const entry of klaw(assetsDir, {
    filter(filePath) {
      const relativePath = toWorkspaceAssetPath(path.relative(assetsDir, filePath))
      return !relativePath || targets.some(target => relativePath === target || relativePath.startsWith(`${target}/`) || target.startsWith(`${relativePath}/`))
    },
  })) {
    if (!entry.stats.isFile()) {
      continue
    }
    const relativePath = toWorkspaceAssetPath(path.relative(assetsDir, entry.path))
    if ((config?.skipChangesetMarkdown ?? true) && relativePath.startsWith('.changeset/') && relativePath.endsWith('.md')) {
      continue
    }
    const targetPath = path.join(targetDir, relativePath)
    await assertUpgradeParents(targetDir, targetPath)
    const before = await readUpgradeFile(targetPath)
    if (relativePath === 'package.json' && before === undefined) {
      continue
    }
    const customRelease = relativePath === '.github/workflows/release.yml'
      && before !== undefined && await classifyReleaseWorkflow(targetDir) === 'custom'
    const forceRelease = relativePath === '.github/workflows/release.yml' && options.overwriteRelease
    const preserved = before !== undefined && (relativePath === 'LICENSE' || (!forceRelease && (options.noOverwrite || options.skipOverwrite)))
    const skipped = customRelease && !forceRelease ? 'custom-release' : preserved ? 'preserved' : undefined
    const after = skipped ? before : await getUpgradeContent(entry.path, relativePath, before, repoName, config?.scripts)
    const unchanged = sameContent(before, after)
    operations.push({
      file: {
        path: relativePath,
        action: skipped || unchanged ? 'skip' : before === undefined ? 'create' : 'update',
        reason: skipped ?? (unchanged ? 'identical' : before === undefined ? 'missing' : 'changed'),
        requiresConfirmation: !skipped && !unchanged && before !== undefined && !forceRelease,
        dependsOn: [],
      },
      targetPath,
      before,
      after,
    })
  }
  const prepared: PreparedUpgrade = { plan: { cwd, targetDir, files: [] }, operations, options }
  await addReleaseMigration(prepared)
  for (const operation of prepared.operations) {
    if (operation.file.action !== 'skip' && !sameContent(operation.before, operation.after)) {
      operation.file.diff = createUpgradeDiff(operation.file.path, operation.before, operation.after, options.diff === true)
    }
  }
  prepared.operations.sort((a, b) => a.file.path.localeCompare(b.file.path))
  prepared.plan.files = prepared.operations.map(item => item.file)
  return prepared
}

/** Preview managed writes and legacy release migration without writing or prompting. */
export async function resolveUpgradePlan(options: CliOpts = {}): Promise<UpgradePlan> {
  // Keep programmatic and CLI previews on the same prepared asset source as
  // the mutating upgrade path. Asset preparation only touches the installed
  // template package; the target workspace remains preview-only.
  await ensureTemplateAssetsPrepared()
  return (await prepareUpgrade(options)).plan
}
