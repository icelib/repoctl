import fs from 'node:fs/promises'
import path from 'node:path'
import { getWorkspacePackageManager } from '@icebreakers/monorepo-templates'

interface PackageJsonLike {
  name?: string
  packageManager?: string
  devDependencies?: Record<string, string>
  scripts?: Record<string, string>
  [key: string]: unknown
}

const repoctlPackageName = 'repoctl'
const legacyToolPackageName = '@icebreakers/monorepo'
const publishedRepoctlVersion = 'latest'

export async function updateRootPackageJson(targetDir: string, projectName: string) {
  const pkgPath = path.join(targetDir, 'package.json')
  const raw = await fs.readFile(pkgPath, 'utf8')
  const pkg = JSON.parse(raw) as PackageJsonLike
  pkg.name = projectName
  pkg.packageManager = await getWorkspacePackageManager()

  const devDependencies = pkg.devDependencies ?? {}
  delete devDependencies[legacyToolPackageName]
  devDependencies[repoctlPackageName] = publishedRepoctlVersion
  pkg.devDependencies = devDependencies

  const scripts = pkg.scripts
  if (scripts) {
    const nextScripts: Record<string, string> = {}
    for (const [key, value] of Object.entries(scripts)) {
      if (typeof value === 'string' && value.includes('monorepo')) {
        continue
      }
      nextScripts[key] = value
    }
    if (Object.keys(nextScripts).length) {
      pkg.scripts = nextScripts
    }
    else {
      delete pkg.scripts
    }
  }

  await fs.writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
}
