import type { Context } from '../../core/context'
import type { PackageJson } from '@/types'
import path from 'pathe'
import { setByPath } from '@/utils'
import fs from '@/utils/fs'
import { resolveWorkspaceDirectory, resolveWorkspacePath } from '../../core/workspace/paths'

/**
 * 根据当前仓库信息同步 package.json 的仓库、作者等字段。
 */
export default async function (ctx: Context) {
  const { git, gitUrl, gitUser, packages, workspaceDir, workspaceFilepath } = ctx

  const workspaceExists = await fs.pathExists(workspaceFilepath)
  if (gitUrl && workspaceExists) {
    const repositoryRoot = await resolveWorkspaceDirectory(await git.getRepoRoot() ?? workspaceDir)
    await Promise.all(packages.map(async (pkg) => {
      if (!await fs.pathExists(pkg.pkgJsonPath)) {
        return
      }

      const pkgJson = JSON.parse(JSON.stringify(pkg.manifest)) as PackageJson
      const directory = path.relative(repositoryRoot, await resolveWorkspacePath(pkg.rootDir))
      setByPath(pkgJson, ['bugs', 'url'], `https://github.com/${gitUrl.full_name}/issues`)
      const repository: PackageJson['repository'] = {
        type: 'git',
        url: `git+https://github.com/${gitUrl.full_name}.git`,
      }
      if (directory) {
        repository.directory = directory
      }

      setByPath(pkgJson, 'repository', repository)
      if (gitUser?.name && gitUser?.email) {
        setByPath(pkgJson, 'author', `${gitUser.name} <${gitUser.email}>`)
      }

      const nextContent = `${JSON.stringify(pkgJson, undefined, 2)}\n`
      const prevContent = await fs.readFile(pkg.pkgJsonPath, 'utf8')
      if (prevContent !== nextContent) {
        await fs.writeFile(pkg.pkgJsonPath, nextContent, 'utf8')
      }
    }))
  }
}
