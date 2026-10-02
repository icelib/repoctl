import type { Context } from '../../core/context'
import path from 'pathe'
import fs from '@/utils/fs'
import { resolveWorkspaceDirectory, resolveWorkspacePath } from '../../core/workspace/paths'

function encodeRelativeLink(relativePath: string) {
  // Keep directory separators and parent segments, but escape URL delimiters
  // and Markdown punctuation (encodeURIComponent alone leaves parentheses).
  return relativePath.split('/').map(segment => encodeURIComponent(segment)
    .replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)).join('/')
}

function escapePackageLabel(name: string) {
  return name.replace(/[\\`*_[\]<>~&]/g, '\\$&')
}

async function getRows(ctx: Context, readmeDirectory: string) {
  const { packages, gitUrl, gitUser } = ctx
  const rows: string[] = []
  if (gitUrl) {
    rows.push(`# ${gitUrl.name}\n`)
  }
  rows.push('## Packages\n')
  const sortedPackages = packages.toSorted((a, b) => {
    // 通过包名排序，生成稳定的 Packages 列表。
    const left = a.manifest.name ?? ''
    const right = b.manifest.name ?? ''
    return left.localeCompare(right)
  })

  for (const pkg of sortedPackages) {
    const p = path.relative(readmeDirectory, await resolveWorkspacePath(pkg.rootDirRealPath))
    if (p) {
      const description = pkg.manifest.description ? `- ${pkg.manifest.description}` : ''
      rows.push(`- [${escapePackageLabel(String(pkg.manifest.name))}](${encodeRelativeLink(p)}) ${description}`)
    }
  }
  // ## Documentation
  // ## Communication
  if (gitUrl) {
    // ## Contributing
    rows.push('\n## Contributing\n')
    rows.push('Contributions Welcome! You can contribute in the following ways.')
    rows.push('')
    rows.push('- Create an Issue - Propose a new feature. Report a bug.')
    rows.push('- Pull Request - Fix a bug and typo. Refactor the code.')
    rows.push('- Create third-party middleware - Instruct below.')
    rows.push('- Share - Share your thoughts on the Blog, X, and others.')
    rows.push(`- Make your application - Please try to use ${gitUrl.name}.`)
    rows.push('')
    rows.push('For more details, see [CONTRIBUTING.md](CONTRIBUTING.md).')
    // ## Contributors
    rows.push('\n## Contributors\n')
    rows.push(`Thanks to [all contributors](https://github.com/${gitUrl.full_name}/graphs/contributors)!`)
  }

  // ## Authors

  rows.push('\n## Authors\n')
  if (gitUser?.name && gitUser?.email) {
    rows.push(`${gitUser.name} <${gitUser.email}>`)
  }

  // ## License

  rows.push('\n## License\n')
  rows.push('Distributed under the MIT License. See [LICENSE](LICENSE) for more information.')

  return rows
}

/**
 * 生成标准化的 README 草稿，列出所有子包并补充贡献者、作者信息。
 */
export default async function (ctx: Context, options: { force?: boolean } = {}) {
  const readmePath = path.resolve(ctx.cwd, 'README.md')
  if (!options.force && await fs.pathExists(readmePath)) {
    return
  }

  const rows = await getRows(ctx, await resolveWorkspaceDirectory(path.dirname(readmePath)))
  await fs.writeFile(readmePath, `${rows.join('\n')}\n`)
}
