import type { Dirent } from 'node:fs'
import type { CreateNewProjectPlan } from './plan'
import type { PackageJson } from '@/types'
import { readdir } from 'node:fs/promises'
import { scaffoldTemplate } from '@icebreakers/monorepo-templates'
import path from 'pathe'
import { setByPath } from '@/utils'
import fs from '@/utils/fs'
import { GitClient } from '../../core/git'
import { migrateLegacyToolingReferences } from '../tooling-migration'

const rootReferenceExtensions = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.json',
  '.mjs',
  '.mts',
  '.ts',
])

const rootReferenceReplacements = [
  {
    from: '../../tsconfig.json',
    to: 'tsconfig.json',
  },
] as const

async function applyGitMetadata(pkgJson: PackageJson, repoDir: string, targetDir: string) {
  try {
    const git = new GitClient({ baseDir: repoDir })
    const repoName = await git.getRepoName()
    if (!repoName) {
      return
    }

    setByPath(pkgJson, ['bugs', 'url'], `https://github.com/${repoName}/issues`)

    const repository: PackageJson['repository'] = {
      type: 'git',
      url: `git+https://github.com/${repoName}.git`,
    }

    const repoRoot = await git.getRepoRoot()
    const directoryBase = repoRoot ?? repoDir
    const relative = path.relative(directoryBase, targetDir)
    if (relative && relative !== '.') {
      repository.directory = relative.split(path.sep).join('/')
    }

    setByPath(pkgJson, 'repository', repository)

    const gitUser = await git.getUser()
    if (gitUser?.name && gitUser?.email) {
      setByPath(pkgJson, 'author', `${gitUser.name} <${gitUser.email}>`)
    }
  }
  catch {
    // 忽略 Git 仓库缺失或配置错误，确保脚手架流程不受影响。
  }
}

function sanitizeTemplatePackageJson(pkgJson: PackageJson) {
  delete pkgJson.author
  delete pkgJson.bugs
  delete pkgJson.homepage
  delete pkgJson.repository
}

function normalizeRelativeSpecifier(fromDir: string, targetPath: string) {
  const relativePath = path.relative(fromDir, targetPath).split(path.sep).join('/')
  if (relativePath.startsWith('.')) {
    return relativePath
  }
  return `./${relativePath}`
}

async function rewriteTemplateRootReferences(targetDir: string, workspaceDir: string) {
  let entries: Dirent<string>[]
  try {
    entries = await readdir(targetDir, { withFileTypes: true })
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return
    }
    throw error
  }

  await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(targetDir, entry.name)

    if (entry.isDirectory()) {
      await rewriteTemplateRootReferences(entryPath, workspaceDir)
      return
    }

    if (!entry.isFile() || !rootReferenceExtensions.has(path.extname(entry.name))) {
      return
    }

    const originalContent = await fs.readFile(entryPath, 'utf8')
    let nextContent = migrateLegacyToolingReferences(originalContent, 'repoctl/tooling')

    for (const replacement of rootReferenceReplacements) {
      if (!nextContent.includes(replacement.from)) {
        continue
      }

      const targetPath = path.join(workspaceDir, replacement.to)
      const rewrittenSpecifier = normalizeRelativeSpecifier(path.dirname(entryPath), targetPath)
      nextContent = nextContent.replaceAll(replacement.from, rewrittenSpecifier)
    }

    if (nextContent !== originalContent) {
      await fs.writeFile(entryPath, nextContent, 'utf8')
    }
  }))
}

export async function renderCreateNewProject(plan: Pick<CreateNewProjectPlan, 'sourceDir' | 'targetDir' | 'cwd' | 'hasPackageJson' | 'packageName' | 'packageJsonFileName'>, gitMetadata = true) {
  await scaffoldTemplate({
    sourceDir: plan.sourceDir,
    targetDir: plan.targetDir,
    skipRootBasenames: ['package.json'],
  })
  await rewriteTemplateRootReferences(plan.targetDir, plan.cwd)

  if (plan.hasPackageJson) {
    const sourceJson = await fs.readJson(path.resolve(plan.sourceDir, 'package.json')) as PackageJson
    sanitizeTemplatePackageJson(sourceJson)
    setByPath(sourceJson, 'version', '0.0.0')
    setByPath(sourceJson, 'name', plan.packageName)
    if (gitMetadata) {
      await applyGitMetadata(sourceJson, plan.cwd, plan.targetDir)
    }
    // renameJson 可将 package.json 暂存为 package.mock.json，满足某些仓库需要自定义命名的情景。
    await fs.outputJson(
      path.resolve(plan.targetDir, plan.packageJsonFileName),
      sourceJson,
      { spaces: 2 },
    )
  }
}
