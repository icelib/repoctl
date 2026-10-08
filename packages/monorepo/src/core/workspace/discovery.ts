import { findPackages } from '@pnpm/fs.find-packages'

/** Discover manifests, including foreign-platform packages, without installing them. */
export async function findWorkspacePackages(root: string, options: { patterns?: string[] } = {}) {
  const packages = await findPackages(root, {
    ...options,
    ignore: ['**/node_modules/**', '**/bower_components/**'],
    includeRoot: true,
  })
  return packages.sort((left, right) => left.rootDir < right.rootDir ? -1 : left.rootDir > right.rootDir ? 1 : 0)
}
