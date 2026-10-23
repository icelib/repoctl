import type { WorkspacePackageWithJsonPath } from '../../types'
import { readFile } from 'node:fs/promises'
import path from 'pathe'
import { getWorkspaceData } from '../../core/workspace'
import { ReleaseCommandError } from './errors'

const EXPECTED_WORKSPACE_SPEC = 'workspace:*'
const PEER_WORKSPACE_SPECS = new Set([EXPECTED_WORKSPACE_SPEC, 'workspace:^', 'workspace:~'])
const DEPENDENCY_SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const

interface PackageManifest {
  name?: string
  private?: boolean
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

function displayPath(workspaceDir: string, packagePath: string) {
  return path.relative(workspaceDir, packagePath).replaceAll('\\', '/')
}

export function collectWorkspaceProtocolViolations(options: {
  workspaceDir: string
  packages: Array<{ file: string, packageJson: PackageManifest }>
  workspacePackageNames: Set<string>
}) {
  const violations: string[] = []

  for (const entry of options.packages) {
    if (entry.packageJson.private === true || typeof entry.packageJson.name !== 'string') {
      continue
    }

    for (const section of DEPENDENCY_SECTIONS) {
      const dependencies = entry.packageJson[section]
      if (!dependencies) {
        continue
      }

      for (const [dependencyName, spec] of Object.entries(dependencies)) {
        const validSpec = section === 'peerDependencies' ? PEER_WORKSPACE_SPECS.has(spec) : spec === EXPECTED_WORKSPACE_SPEC
        if (options.workspacePackageNames.has(dependencyName) && !validSpec) {
          violations.push(`${displayPath(options.workspaceDir, entry.file)} -> ${section}.${dependencyName}=${spec}`)
        }
      }
    }
  }

  return violations
}

async function readPackageManifest(file: string) {
  return JSON.parse(await readFile(file, 'utf8')) as PackageManifest
}

export async function assertWorkspaceDependencyProtocols(cwd: string) {
  const { workspaceDir, packages } = await getWorkspaceData(cwd, { ignorePrivatePackage: false })
  const manifests = await Promise.all(packages.map(async (pkg: WorkspacePackageWithJsonPath) => ({
    file: pkg.pkgJsonPath,
    packageJson: await readPackageManifest(pkg.pkgJsonPath),
  })))
  const workspacePackageNames = new Set(
    manifests
      .map(({ packageJson }) => packageJson.name)
      .filter((name): name is string => typeof name === 'string'),
  )
  const violations = collectWorkspaceProtocolViolations({
    workspaceDir,
    packages: manifests,
    workspacePackageNames,
  })

  if (violations.length > 0) {
    throw new ReleaseCommandError([
      `Expected publishable workspace dependencies to use ${EXPECTED_WORKSPACE_SPEC}:`,
      'Internal peerDependencies may also use workspace:^ or workspace:~ to preserve their compatibility ranges.',
      ...violations.map(violation => `- ${violation}`),
    ].join('\n'))
  }
}
