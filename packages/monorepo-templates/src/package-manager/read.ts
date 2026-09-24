import fs from 'node:fs/promises'

const packageManagerPattern = /^pnpm@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u

export function validateWorkspacePackageManager(value: unknown, source: string) {
  if (typeof value !== 'string' || !packageManagerPattern.test(value)) {
    throw new Error(`Invalid packageManager in ${source}; expected a pnpm version such as pnpm@12.5.1.`)
  }
  return value
}

export async function readPackageManagerFromManifest(manifestPath: string) {
  const raw = await fs.readFile(manifestPath, 'utf8')
  const manifest = JSON.parse(raw) as { packageManager?: unknown } | null
  return validateWorkspacePackageManager(manifest?.packageManager, manifestPath)
}
