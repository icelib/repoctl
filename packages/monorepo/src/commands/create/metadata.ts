import type { PackageJson } from '../../types'
import path from 'pathe'
import { GitClient } from '../../core/git'
import { resolveWorkspaceDirectory, resolveWorkspacePath } from '../../core/workspace/paths'
import { setByPath } from '../../utils'

export async function applyGitMetadata(pkgJson: PackageJson, repoDir: string, targetDir: string) {
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
    const [directoryBase, physicalTarget] = await Promise.all([
      resolveWorkspaceDirectory(repoRoot ?? repoDir),
      resolveWorkspacePath(targetDir),
    ])
    const relative = path.relative(directoryBase, physicalTarget)
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

export function sanitizeTemplatePackageJson(pkgJson: PackageJson) {
  delete pkgJson.author
  delete pkgJson.bugs
  delete pkgJson.homepage
  delete pkgJson.repository
}
