import { access, open, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { readPackageManagerFromManifest } from './package-manager/read'
import { assetsDir, packageDir, templatesDir } from './paths'
import { prepareAssets, sanitizePublishedWorkspaceContent } from './prepare'

const lockFileName = '.prepare-assets.lock'
const lockPollIntervalMs = 200
const lockTimeoutMs = 30_000

let ensurePromise: Promise<void> | null = null

async function pathExists(targetPath: string) {
  try {
    await access(targetPath)
    return true
  }
  catch {
    return false
  }
}

async function acquireLock(lockPath: string) {
  try {
    return await open(lockPath, 'wx')
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      return null
    }
    throw error
  }
}

async function isPrepared() {
  const checks = [
    path.join(assetsDir, 'AGENTS.md'),
    path.join(assetsDir, 'LICENSE'),
    path.join(templatesDir, 'tsdown'),
  ]
  const results = await Promise.all(checks.map(pathExists))
  if (!results.every(Boolean)) {
    return false
  }

  const sourceRoot = path.resolve(packageDir, '..', '..')
  const sourceManifest = path.join(sourceRoot, 'package.json')
  let sourcePackage: { name?: unknown }
  try {
    sourcePackage = JSON.parse(await readFile(sourceManifest, 'utf8')) as { name?: unknown }
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return true
    }
    throw error
  }

  if (sourcePackage.name !== 'repoctl-workspace') {
    return true
  }

  const [sourcePackageManager, sourceNpmrc, sourceWorkspace] = await Promise.all([
    readPackageManagerFromManifest(sourceManifest),
    readFile(path.join(sourceRoot, '.npmrc'), 'utf8'),
    readFile(path.join(sourceRoot, 'pnpm-workspace.yaml'), 'utf8'),
  ])

  let preparedPackageManager: string
  let preparedNpmrc: string
  let preparedWorkspace: string
  let sourceAgentContent: string[]
  let preparedAgentContent: string[]
  let sourceSkillContent: string
  let preparedSkillContent: string
  try {
    const sourceAgentFiles = ['AGENTS.md', 'CLAUDE.md'] as const
    const [prepared, sourceAgents, preparedAgents, sourceSkill, preparedSkill] = await Promise.all([
      Promise.all([
        readPackageManagerFromManifest(path.join(assetsDir, 'package.json')),
        readFile(path.join(assetsDir, 'npmrc'), 'utf8'),
        readFile(path.join(assetsDir, 'pnpm-workspace.yaml'), 'utf8'),
      ]),
      Promise.all(sourceAgentFiles.map(filename => readFile(path.join(sourceRoot, 'packages/monorepo/assets', filename), 'utf8'))),
      Promise.all(sourceAgentFiles.map(filename => readFile(path.join(assetsDir, filename), 'utf8'))),
      readFile(path.join(sourceRoot, 'packages/monorepo/resources/skills/repoctl/SKILL.md'), 'utf8'),
      readFile(path.join(assetsDir, '.agents/skills/repoctl/SKILL.md'), 'utf8'),
    ])
    preparedPackageManager = prepared[0]
    preparedNpmrc = prepared[1]
    preparedWorkspace = prepared[2]
    sourceAgentContent = sourceAgents
    preparedAgentContent = preparedAgents
    sourceSkillContent = sourceSkill
    preparedSkillContent = preparedSkill
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError) {
      return false
    }
    if (error instanceof Error && error.message.startsWith('Invalid packageManager in ')) {
      return false
    }
    throw error
  }

  return sourcePackageManager === preparedPackageManager
    && sourceNpmrc === preparedNpmrc
    && sanitizePublishedWorkspaceContent(sourceWorkspace) === preparedWorkspace
    && sourceAgentContent.every((content, index) => content === preparedAgentContent[index])
    && sourceSkillContent === preparedSkillContent
}

async function waitForPrepared() {
  const deadline = Date.now() + lockTimeoutMs
  while (Date.now() < deadline) {
    if (await isPrepared()) {
      return true
    }
    await new Promise(resolve => setTimeout(resolve, lockPollIntervalMs))
  }
  return false
}

async function runEnsure() {
  if (await isPrepared()) {
    return
  }

  const lockPath = path.join(packageDir, lockFileName)
  let lockHandle = await acquireLock(lockPath)
  if (!lockHandle) {
    const prepared = await waitForPrepared()
    if (prepared) {
      return
    }
    lockHandle = await acquireLock(lockPath)
    if (!lockHandle) {
      throw new Error(`Failed to prepare template assets: lock is held at ${lockPath}`)
    }
  }

  try {
    // Preserve existing files when multiple processes race on the same workspace.
    await prepareAssets({ overwriteExisting: false, silent: true })
  }
  finally {
    await lockHandle.close().catch(() => {})
    await rm(lockPath, { force: true }).catch(() => {})
  }
}

export async function ensureTemplateAssetsPrepared() {
  if (!ensurePromise) {
    ensurePromise = runEnsure().finally(() => {
      ensurePromise = null
    })
  }
  await ensurePromise
}
