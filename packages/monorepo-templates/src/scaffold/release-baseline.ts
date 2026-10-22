import type { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { packageDir } from '../paths'

const releasePath = '.github/workflows/release.yml'
const digest = (content: string | Buffer) => createHash('sha256').update(content).digest('hex')

/** Record known upstream bytes during fresh scaffolding, never infer an existing project's history. */
export async function registerScaffoldReleaseBaseline(targetDir: string, assetsDir: string) {
  const upstream = await readFile(path.join(assetsDir, releasePath))
  if (!upstream.toString().startsWith('# repoctl-managed: release/v2\n')) {
    return
  }
  try {
    const output = await lstat(path.join(targetDir, releasePath))
    if (!output.isFile() || output.isSymbolicLink()) {
      throw new Error('Scaffold release workflow must be a regular file')
    }
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return
    }
    throw error
  }
  const metadata = JSON.parse(await readFile(path.join(packageDir, 'package.json'), 'utf8')) as { name: string, version: string }
  if (metadata.name !== '@icebreakers/monorepo-templates' || !metadata.version) {
    throw new Error('Invalid scaffold template package identity')
  }
  const record = {
    schemaVersion: 1,
    path: releasePath,
    source: { package: metadata.name, version: metadata.version, assetPath: releasePath, hash: digest(upstream) },
    upstream: { hash: digest(upstream), content: upstream.toString('base64') },
  }
  let directory = targetDir
  for (const name of ['.repoctl', 'baselines', 'root']) {
    directory = path.join(directory, name)
    await mkdir(directory).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') {
        throw error
      }
    })
    const info = await lstat(directory)
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new Error('Scaffold baseline directory must not contain symbolic links')
    }
  }
  await writeFile(path.join(directory, `${digest(releasePath)}.json`), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' })
}
