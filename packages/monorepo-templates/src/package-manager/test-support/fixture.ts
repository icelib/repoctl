import { execFile } from 'node:child_process'
import { access, cp, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
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

async function resolveDependency(name: string, fromDir: string) {
  let currentDir = fromDir
  while (true) {
    try {
      return await realpath(path.join(currentDir, 'node_modules', name))
    }
    catch {
      const parentDir = path.dirname(currentDir)
      if (parentDir === currentDir) {
        break
      }
      currentDir = parentDir
    }
  }
  const storePath = path.join(sourceRoot, 'node_modules/.pnpm')
  try {
    for (const entry of await readdir(storePath)) {
      const candidate = path.join(storePath, entry, 'node_modules', name)
      try {
        await access(candidate)
        return await realpath(candidate)
      }
      catch {
        // Continue through pnpm's virtual store entries.
      }
    }
  }
  catch {
    // Fall through to the normal resolution error below.
  }
  return await realpath(path.join(sourcePackageDir, 'node_modules', name))
}

async function copyDependency(name: string, destinationRoot: string, seen = new Set<string>(), fromDir = sourcePackageDir) {
  if (seen.has(name)) {
    return
  }
  seen.add(name)
  const source = await resolveDependency(name, fromDir)
  const destination = path.join(destinationRoot, name)
  await mkdir(path.dirname(destination), { recursive: true })
  await cp(source, destination, { recursive: true })
  const manifest = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
    optionalDependencies?: Record<string, string>
  }
  for (const dependency of new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ])) {
    await copyDependency(dependency, destinationRoot, seen, source)
  }
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
  ])
  const packageManifest = JSON.parse(await readFile(path.join(sourcePackageDir, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
  }
  const dependencies = Object.keys(packageManifest.dependencies ?? {})
  for (const dependency of dependencies) {
    await copyDependency(dependency, path.join(packageDir, 'node_modules'))
  }

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
