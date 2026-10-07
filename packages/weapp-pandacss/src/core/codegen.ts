import path from 'node:path'
import fs from 'fs-extra'
import { getPackageInfoSync } from 'local-pkg'
import type { ICreateContextOptions } from '@/types'
import { dedent } from '@/utils'

export function getWeappCoreEscapeDir() {
  const rootPath = getPackageInfoSync('@weapp-core/escape')!.rootPath
  return path.join(rootPath, 'dist')
}

export function getPandaVersion() {
  return getPackageInfoSync('@pandacss/dev')?.version
}

// dirName: string = 'weapp-panda'
export async function copyEscape(destDir: string) {
  const result: string[] = []
  const srcDir = getWeappCoreEscapeDir()
  const filesnames = await fs.readdir(srcDir)
  await fs.ensureDir(destDir)

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
) {
  await fs.ensureDir(destDir)
  const code = dedent`
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
  await fs.writeFile(path.resolve(destDir, 'index.mjs'), code, 'utf8')
  await fs.writeFile(
    path.resolve(destDir, 'index.d.ts'),
    dedent`
    export declare function escape(selectors: string): string;`,
    'utf8',
  )
}
