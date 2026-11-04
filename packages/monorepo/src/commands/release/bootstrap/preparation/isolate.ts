import type { BootstrapOptions, BootstrapPlan } from '../types'
import { lstat, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { consumerEnvironment } from '../../nightly/consumer/environment'
import { isolatedPnpmOptions, isolatedSnapshotEnvironment, snapshotCommand } from '../../snapshot/process'
import { emptyBootstrapOutput } from '../output'

function inside(root: string, target: string) {
  const relative = path.relative(root, target)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

async function externalParent(requested: string, root: string) {
  let existing = path.resolve(requested)
  while (true) {
    try {
      await lstat(existing)
      break
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || path.dirname(existing) === existing) {
        throw error
      }
      existing = path.dirname(existing)
    }
  }
  const resolved = path.resolve(await realpath(existing), path.relative(existing, path.resolve(requested)))
  if (inside(root, resolved)) {
    throw new Error('Bootstrap output must be outside the source repository.')
  }
  await mkdir(resolved, { recursive: true })
  return realpath(resolved)
}

export async function isolateBootstrap(root: string, plan: BootstrapPlan, options: BootstrapOptions) {
  const parent = await externalParent(options.outputDirectory ?? tmpdir(), root)
  if (options.outputDirectory) {
    await emptyBootstrapOutput(parent)
  }
  const temporaryParent = options.outputDirectory ? path.dirname(parent) : parent
  const directory = await mkdtemp(path.join(temporaryParent, 'repoctl-bootstrap-'))
  const source = path.join(directory, 'source')
  await mkdir(source)
  const env: NodeJS.ProcessEnv = {
    ...consumerEnvironment(options.env ?? process.env, directory),
    REPOCTL_BOOTSTRAP_RUNNING: '1',
  }
  await writeFile(env['npm_config_userconfig']!, '')
  await writeFile(env['npm_config_globalconfig']!, '')
  const execution = { ...options, env: isolatedSnapshotEnvironment({ env }, directory) }
  const archive = path.join(directory, 'source.tar')
  snapshotCommand('git', ['archive', '--format=tar', '--output', archive, plan.source.commit], { ...options, cwd: root })
  snapshotCommand('tar', ['-xf', archive, '-C', source], execution)
  await rm(archive)
  snapshotCommand('pnpm', [...isolatedPnpmOptions, 'install', '--frozen-lockfile', '--registry', plan.registry], { ...execution, cwd: source })
  return { directory, source, env: execution.env }
}
