import type { SnapshotOptions, SnapshotReport } from './types'
import { lstat, mkdir, mkdtemp, readdir, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { isolatedPnpmOptions, isolatedSnapshotEnvironment, snapshotCommand } from './process'

function inside(root: string, target: string) {
  const relative = path.relative(root, target)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

async function externalParent(directory: string, source: string) {
  const requested = path.resolve(directory)
  let existing = requested
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
  const canonical = path.resolve(await realpath(existing), path.relative(existing, requested))
  if (inside(source, canonical)) {
    throw new Error('Snapshot output must be outside the source repository.')
  }
  await mkdir(canonical, { recursive: true })
  return realpath(canonical)
}

async function rejectLinks(directory: string) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) {
      throw new Error('Snapshot source archives cannot contain symbolic links.')
    }
    if (entry.isDirectory()) {
      await rejectLinks(path.join(directory, entry.name))
    }
  }
}

export async function isolateSnapshot(report: SnapshotReport, options: SnapshotOptions) {
  const parent = await externalParent(options.outputDirectory ?? tmpdir(), report.source)
  const directory = await mkdtemp(path.join(parent, `repoctl-snapshot-${report.identityKey.slice(0, 12)}-`))
  report.outputDirectory = directory
  const source = path.join(directory, 'source')
  await mkdir(source)
  if (/^160000 /m.test(snapshotCommand('git', ['ls-tree', '-r', report.identity.commit], { ...options, cwd: report.source }))) {
    throw new Error('Snapshot source archives do not support Git submodules.')
  }
  const archive = path.join(directory, 'source.tar')
  snapshotCommand('git', ['archive', '--format=tar', '--output', archive, report.identity.commit], { ...options, cwd: report.source })
  snapshotCommand('tar', ['-xf', archive, '-C', source], options)
  await rm(archive)
  await rejectLinks(source)
  snapshotCommand('pnpm', [...isolatedPnpmOptions, 'install', '--frozen-lockfile'], { ...options, cwd: source, env: isolatedSnapshotEnvironment(options, directory) })
  return source
}
