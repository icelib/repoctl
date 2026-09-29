import { mkdir, readFile, realpath, symlink } from 'node:fs/promises'
import path from 'node:path'

async function resolveDependency(name: string, fromDir: string): Promise<string> {
  const candidate = path.join(fromDir, 'node_modules', name)
  try {
    return await realpath(candidate)
  }
  catch (error) {
    const parent = path.dirname(fromDir)
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || parent === fromDir) {
      throw error
    }
    return resolveDependency(name, parent)
  }
}

export async function linkDependencies(sourcePackageDir: string, packageDir: string) {
  const manifest = JSON.parse(await readFile(path.join(sourcePackageDir, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
  }
  for (const name of Object.keys(manifest.dependencies ?? {})) {
    const source = await resolveDependency(name, sourcePackageDir)
    const destination = path.join(packageDir, 'node_modules', name)
    await mkdir(path.dirname(destination), { recursive: true })
    // Link each resolved package so hoisted dependencies remain available, too.
    // Junctions work on Windows without requiring symlink privileges.
    await symlink(source, destination, 'junction')
  }
}
