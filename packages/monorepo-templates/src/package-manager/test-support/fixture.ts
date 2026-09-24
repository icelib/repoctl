import { execFile } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const sourcePackageDir = fileURLToPath(new URL('../../../', import.meta.url))
const sourceRoot = path.resolve(sourcePackageDir, '../..')

async function outputFile(file: string, content: string) {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, content)
}

export async function createPackageManagerFixture() {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'repoctl-package-manager-')))
  const packageDir = path.join(root, 'packages/monorepo-templates')
  const assetsDir = path.join(packageDir, 'assets')
  const sourceManifest = JSON.parse(await readFile(path.join(sourceRoot, 'package.json'), 'utf8')) as {
    packageManager: string
  }
  const npmrc = await readFile(path.join(sourceRoot, '.npmrc'), 'utf8')
  const sourceFiles = [
    'LICENSE',
    'packages/monorepo/assets/AGENTS.md',
    'packages/monorepo/assets/CLAUDE.md',
    'packages/monorepo/resources/skills/repoctl/SKILL.md',
  ]

  await mkdir(packageDir, { recursive: true })
  await Promise.all([
    ...['dist', 'assets-data.mjs', 'template-data.mjs'].map(name => cp(path.join(sourcePackageDir, name), path.join(packageDir, name), { recursive: true })),
    ...sourceFiles.map(async name => outputFile(path.join(root, name), await readFile(path.join(sourceRoot, name), 'utf8'))),
    outputFile(path.join(root, 'package.json'), JSON.stringify({ name: 'repoctl-workspace', packageManager: sourceManifest.packageManager })),
    outputFile(path.join(root, '.npmrc'), npmrc),
    outputFile(path.join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\npmOnFail: error\n'),
    outputFile(path.join(root, 'templates/tsdown/package.json'), JSON.stringify({ name: 'fixture-library' })),
    outputFile(path.join(assetsDir, 'package.json'), JSON.stringify({ packageManager: 'pnpm@10.20.0' })),
    outputFile(path.join(assetsDir, 'npmrc'), 'package-manager-strict=false\n'),
    outputFile(path.join(assetsDir, '.npmrc'), 'package-manager-strict=false\n'),
    outputFile(path.join(assetsDir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\npmOnFail: warn\n'),
    ...['AGENTS.md', 'CLAUDE.md', 'LICENSE', '.agents/skills/repoctl/SKILL.md'].map(name => outputFile(path.join(assetsDir, name), 'outdated cached asset\n')),
    mkdir(path.join(packageDir, 'templates/tsdown'), { recursive: true }),
    symlink(path.join(sourcePackageDir, 'node_modules'), path.join(packageDir, 'node_modules'), 'junction'),
  ])

  return {
    root,
    assetsDir,
    packageManager: sourceManifest.packageManager,
    npmrc,
    async getPackageManager() {
      const entry = pathToFileURL(path.join(packageDir, 'dist/index.mjs')).href
      const { stdout } = await execFileAsync(process.execPath, [
        '--input-type=module',
        '--eval',
        `import { getWorkspacePackageManager } from ${JSON.stringify(entry)}; process.stdout.write(await getWorkspacePackageManager())`,
      ], { cwd: root, encoding: 'utf8' })
      return stdout
    },
    async usePublishedAssets(packageManager: unknown) {
      await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'consumer-workspace' }))
      await writeFile(path.join(assetsDir, 'package.json'), JSON.stringify({ packageManager }))
    },
    async cleanup() {
      await rm(root, { recursive: true, force: true })
    },
  }
}
