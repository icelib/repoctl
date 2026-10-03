import { Buffer } from 'node:buffer'
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

export async function planWorkspaceManifest(workspaceDir: string, targetName: string) {
  const workspacePath = path.resolve(workspaceDir, 'pnpm-workspace.yaml')
  const exists = await fs.pathExists(workspacePath)
  const before = exists ? await fs.readFile(workspacePath) : null
  const manifest = before ? YAML.parse(before.toString('utf8')) ?? {} : {}
  const currentPackages = Array.isArray(manifest.packages)
    ? manifest.packages.filter((item: unknown): item is string => typeof item === 'string')
    : []
  const pattern = inferWorkspacePattern(targetName)
  if (currentPackages.includes(pattern)) {
    return { before, after: before }
  }

  const nextManifest = {
    ...(typeof manifest === 'object' && manifest !== null ? manifest : {}),
    packages: [...currentPackages, pattern],
  }
  return { before, after: Buffer.from(YAML.stringify(nextManifest, { singleQuote: true })) }
}

export async function updateWorkspaceManifest(workspaceDir: string, targetName: string) {
  const plan = await planWorkspaceManifest(workspaceDir, targetName)
  if (plan.after && !plan.after.equals(plan.before ?? Buffer.alloc(0))) {
    await fs.outputFile(path.resolve(workspaceDir, 'pnpm-workspace.yaml'), plan.after)
  }
}
