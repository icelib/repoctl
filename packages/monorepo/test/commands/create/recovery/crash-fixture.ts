import { execFile } from 'node:child_process'
import { lstat, readdir, readFile, readlink } from 'node:fs/promises'
import process from 'node:process'
import { promisify } from 'node:util'
import path from 'pathe'

export const recoveryNow = () => Date.now() + 2 * 24 * 60 * 60 * 1000
export const originalManifest = 'packages: [packages/*]\n'

const builtModule = new URL('../../../../dist/index.mjs', import.meta.url).href
const execute = promisify(execFile)

/** Exit without unwinding create's catch/finally to model a terminated process. */
export async function crashCreate(root: string, phase: 'before-commit' | 'after-commit' = 'after-commit') {
  const script = `
    import fs from 'node:fs/promises'
    import path from 'node:path'
    import { syncBuiltinESMExports } from 'node:module'
    const [root, phase, moduleUrl] = process.argv.slice(1)
    const unlink = fs.unlink
    fs.unlink = async function (entry) {
      if (path.basename(String(entry)) === '.repoctl-create-target.json') process.exit(86)
      return unlink(entry)
    }
    for (const operation of ['rename', 'link']) {
      const original = fs[operation]
      fs[operation] = async function (source, target) {
        if (phase === 'before-commit' && target === path.join(root, 'pnpm-workspace.yaml')) process.exit(86)
        return original(source, target)
      }
    }
    syncBuiltinESMExports()
    const { createNewProject } = await import(moduleUrl)
    await createNewProject({ cwd: root, name: 'services/api', type: 'tsdown' })
  `
  try {
    await execute(process.execPath, ['--input-type=module', '-e', script, root, phase, builtModule], { timeout: 30000 })
    throw new Error('Create did not reach the interruption point')
  }
  catch (error) {
    if ((error as { code?: number }).code !== 86) {
      throw error
    }
  }
  const targetDir = path.join(root, 'services/api')
  const marker = JSON.parse(await readFile(path.join(targetDir, '.repoctl-create-target.json'), 'utf8')) as { stagingDir: string }
  return { targetDir, stagingDir: marker.stagingDir, manifestPath: path.join(root, 'pnpm-workspace.yaml') }
}

/** Compare all paths, bytes, link destinations and file modes for dry-run checks. */
export async function snapshotTree(root: string): Promise<Record<string, string>> {
  const entries: Record<string, string> = {}
  async function visit(directory: string) {
    for (const name of (await readdir(directory)).sort()) {
      const absolute = path.join(directory, name)
      const relative = path.relative(root, absolute)
      const stat = await lstat(absolute)
      if (stat.isSymbolicLink()) {
        entries[relative] = `link:${await readlink(absolute)}`
      }
      else if (stat.isDirectory()) {
        entries[relative] = 'directory'
        await visit(absolute)
      }
      else {
        entries[relative] = `${stat.mode}:${(await readFile(absolute)).toString('base64')}`
      }
    }
  }
  await visit(root)
  return entries
}
