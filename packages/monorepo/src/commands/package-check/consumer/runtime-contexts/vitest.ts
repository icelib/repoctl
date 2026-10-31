import type { ConsumerEntry } from '../../types'
import { mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { consumerAssetSource } from '../runtime-assets'

function importTarget(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value
  }
  if (Array.isArray(value)) {
    return value.map(importTarget).find(Boolean)
  }
  if (value && typeof value === 'object') {
    for (const [condition, target] of Object.entries(value)) {
      if (['node', 'import', 'default'].includes(condition)) {
        const resolved = importTarget(target)
        if (resolved) {
          return resolved
        }
      }
    }
  }
}

function inside(root: string, filename: string): void {
  const relative = path.relative(root, filename)
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Consumer resolved Vitest outside its isolated directory.')
  }
}

interface VitestManifest {
  name?: string
  version?: string
  bin?: string | { vitest?: string }
  exports?: Record<string, unknown>
  module?: string
}

/** 使用隔离消费者安装的真实 Vitest 执行 setup 和生命周期 smoke case。 */
export async function vitestConsumerInvocation(entry: ConsumerEntry, specifier: string, directory: string, installed: string): Promise<string[]> {
  const root = await realpath(directory)
  const require = createRequire(path.join(installed, 'package.json'))
  const manifestFile = await realpath(require.resolve('vitest/package.json'))
  inside(root, manifestFile)
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8')) as VitestManifest
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.vitest
  const target = importTarget(manifest.exports?.['.'] ?? manifest.exports ?? manifest.module)
  if (manifest.name !== 'vitest' || typeof manifest.version !== 'string' || !manifest.version || typeof bin !== 'string' || typeof target !== 'string' || !target.startsWith('./')) {
    throw new Error('Consumer requires an installed Vitest CLI and declared ESM entry.')
  }
  const cli = await realpath(path.resolve(path.dirname(manifestFile), bin))
  const frameworkEntry = await realpath(path.resolve(path.dirname(manifestFile), target))
  inside(root, cli)
  inside(root, frameworkEntry)
  const smoke = await mkdtemp(path.join(root, '.repoctl-vitest-'))
  const testFile = path.join(smoke, 'setup.test.mjs')
  const configFile = path.join(smoke, 'vitest.config.mjs')
  const runnerFile = path.join(smoke, 'run.mjs')
  await writeFile(testFile, `import { test } from ${JSON.stringify(pathToFileURL(frameworkEntry).href)};\ntest("declared setup executes in Vitest", () => {});\n`)
  await writeFile(configFile, `export default ${JSON.stringify({
    root,
    test: {
      include: [path.relative(root, testFile).split(path.sep).join('/')],
      setupFiles: [specifier],
      environment: 'node',
      fileParallelism: false,
      maxWorkers: 1,
      watch: false,
      passWithNoTests: false,
    },
  })};\n`)
  await writeFile(runnerFile, [
    consumerAssetSource(entry, specifier, installed),
    `process.argv = [process.execPath, ${JSON.stringify(cli)}, "run", "--config", ${JSON.stringify(configFile)}];`,
    `await import(${JSON.stringify(pathToFileURL(cli).href)});`,
  ].join('\n'))
  return [runnerFile]
}
