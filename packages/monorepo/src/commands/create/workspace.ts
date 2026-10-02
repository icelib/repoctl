import path from 'pathe'
import YAML from 'yaml'
import fs from '@/utils/fs'

function inferWorkspacePattern(targetName: string) {
  const normalized = targetName.split(path.sep).join('/')
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]}/*`
  }
  return 'packages/*'
}

export async function updateWorkspaceManifest(workspaceDir: string, targetName: string) {
  const workspacePath = path.resolve(workspaceDir, 'pnpm-workspace.yaml')
  const exists = await fs.pathExists(workspacePath)
  const manifest = exists ? YAML.parse(await fs.readFile(workspacePath, 'utf8')) ?? {} : {}
  const currentPackages = Array.isArray(manifest.packages)
    ? manifest.packages.filter((item: unknown): item is string => typeof item === 'string')
    : []
  const pattern = inferWorkspacePattern(targetName)
  if (currentPackages.includes(pattern)) {
    return
  }

  const nextManifest = {
    ...(typeof manifest === 'object' && manifest !== null ? manifest : {}),
    packages: [...currentPackages, pattern],
  }
  await fs.outputFile(workspacePath, YAML.stringify(nextManifest, { singleQuote: true }), 'utf8')
}
