import type { ICreateContextOptions } from '@/types'
import fs from 'node:fs/promises'
import path from 'node:path'
import { getPackageInfoSync } from 'local-pkg'
import { dedent } from '@/utils'

export type PandaRuntimeExtension = 'mjs' | 'js'

export interface PandaRuntimeFiles {
  extension: PandaRuntimeExtension
  helperPath: string
  backupPath: string
}

export async function exists(filename: string) {
  try {
    await fs.access(filename)
    return true
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false
    }
    throw error
  }
}

export function getWeappCoreEscapeDir() {
  const packageInfo = getPackageInfoSync('@weapp-core/escape', {
    paths: [path.resolve(import.meta.dirname, '..')],
  })
  if (!packageInfo) {
    throw new Error(
      'Cannot resolve @weapp-core/escape. Install @weapp-core/escape before running weapp-panda codegen.',
    )
  }
  const rootPath = packageInfo.rootPath
  return path.join(rootPath, 'dist')
}

export function getPandaVersion() {
  return getPackageInfoSync('@pandacss/dev', {
    paths: [path.resolve(import.meta.dirname, '..')],
  })?.version
}

export async function findPandaRuntime(outdir: string): Promise<PandaRuntimeFiles> {
  for (const extension of ['mjs', 'js'] as const) {
    const helperPath = path.resolve(outdir, `helpers.${extension}`)
    if (await exists(helperPath)) {
      return {
        extension,
        helperPath,
        backupPath: path.resolve(outdir, `_helpers.backup.${extension}`),
      }
    }
  }

  const generatedTypes = path.resolve(outdir, 'helpers.ts')
  if (await exists(generatedTypes)) {
    throw new Error(
      `Panda generated helpers.ts in ${outdir}. Set panda.config.ts outExtension to "mjs" or "js" before running weapp-panda codegen.`,
    )
  }

  throw new Error(
    `Cannot find Panda CSS runtime helpers in ${outdir}. Did you forget to run \`panda codegen\`?`,
  )
}

// dirName: string = 'weapp-panda'
export async function copyEscape(destDir: string) {
  const result: string[] = []
  const srcDir = getWeappCoreEscapeDir()
  const filesnames = await fs.readdir(srcDir)
  await fs.mkdir(destDir, { recursive: true })

  for (const filesname of filesnames) {
    const src = path.resolve(srcDir, filesname)
    const stats = await fs.stat(src)
    if (stats.isFile()) {
      const dest = path.resolve(destDir, filesname)
      result.push(dest)
      await fs.copyFile(src, dest)
    }
  }
  return result
}

export async function generateEscapeWrapper(
  destDir: string,
  options: ICreateContextOptions,
  extension: PandaRuntimeExtension = 'mjs',
) {
  await fs.mkdir(destDir, { recursive: true })
  const code = dedent`
  // @weapp-core/escape publishes an ESM runtime as index.mjs; the wrapper
  // itself follows Panda's helper extension so the generated helper can import
  // it from either helpers.mjs or helpers.js.
  import { escape as _escape } from './lib/index.mjs'

  function predicate(className){
    if(${options.escapePredicate}){
      return true
    }
    return false
  }

  function escape(className) {
    if(predicate(className)){
      return _escape(className)
    }
    return className
  }
  export { escape }
  `
  await fs.writeFile(path.resolve(destDir, `index.${extension}`), code, 'utf8')
  await fs.writeFile(
    path.resolve(destDir, 'index.d.ts'),
    dedent`
    export declare function escape(selectors: string): string;`,
    'utf8',
  )
}
