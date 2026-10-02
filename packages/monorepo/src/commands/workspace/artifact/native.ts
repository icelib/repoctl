import type { WorkspaceArtifactPlan } from '../../../types/artifact'
import { constants } from 'node:fs'
import { access, readFile, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import process from 'node:process'
import path from 'pathe'
import { satisfies, valid } from 'semver'
import { pnpmGuards, runNative } from './process'
import { deployWritePaths } from './settings'
import { fileHash, fingerprint } from './tree'

async function executable(name: string) {
  const suffixes = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : ['']
  for (const directory of (process.env['PATH'] ?? '').split(path.delimiter)) {
    for (const suffix of suffixes) {
      const filename = path.resolve(directory || '.', `${name}${suffix}`)
      try {
        await access(filename, process.platform === 'win32' ? constants.F_OK : constants.X_OK)
        return path.resolve(await realpath(filename))
      }
      catch { /* Continue to the next PATH executable. */ }
    }
  }
  throw new Error(`Install the workspace's pinned ${name} before preparing artifacts; repoctl never downloads tools.`)
}

export async function nativeTool(root: string, mode: 'prune' | 'deploy', packageManager: string): Promise<WorkspaceArtifactPlan['tool']> {
  if (mode === 'deploy') {
    if (!satisfies(packageManager, '>=10.0.0 <13')) {
      throw new Error('Deploy supports stable pinned pnpm majors 10, 11 and 12.')
    }
    const filename = await executable('pnpm')
    const version = await runNative(filename, [...pnpmGuards, '--version'], root)
    if (!valid(version) || !satisfies(version, '>=10.0.0 <13') || version !== packageManager) {
      throw new Error(`Deploy requires the exact root packageManager pnpm@${packageManager}; observed ${version}. Supported pnpm majors: 10, 11, 12.`)
    }
    const help = await runNative(filename, [...pnpmGuards, 'deploy', '--help'], root)
    if (!help.includes('--prod') || !help.includes('--legacy')) {
      throw new Error('The selected pnpm does not provide the supported deploy command.')
    }
    const writePaths = await deployWritePaths(root, filename, pnpmGuards)
    return { name: 'pnpm', version, executable: filename, prefix: pnpmGuards, hash: fingerprint([await fileHash(filename), writePaths]), writePaths }
  }
  const require = createRequire(path.join(root, 'package.json'))
  let manifestFile: string
  try {
    manifestFile = require.resolve(path.join(root, 'node_modules/turbo/package.json'))
  }
  catch {
    throw new Error('Install Turbo 2 in the source workspace before pruning; repoctl never downloads tools.')
  }
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8')) as { version?: string, bin?: string | { turbo?: string } }
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.turbo
  if (!manifest.version || !satisfies(manifest.version, '>=2.0.0 <3') || !bin) {
    throw new Error('Workspace pruning requires a locally installed stable Turbo 2 command.')
  }
  const filename = path.resolve(path.dirname(manifestFile), bin)
  const prefix = [filename, '--skip-infer', '--no-update-notifier']
  const version = await runNative(process.execPath, [...prefix, '--version'], root)
  if (version !== manifest.version) {
    throw new Error('The installed Turbo executable does not match its package version.')
  }
  const help = await runNative(process.execPath, [...prefix, 'prune', '--help'], root)
  if (!help.includes('--out-dir') || !help.includes('--docker')) {
    throw new Error('The selected Turbo does not provide the supported prune command.')
  }
  return { name: 'turbo', version, executable: process.execPath, prefix, hash: fingerprint([await fileHash(filename), await fileHash(manifestFile)]), writePaths: [] }
}
