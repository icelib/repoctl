import { parse, stringify } from 'comment-json'
import path from 'pathe'
import fs from '@/utils/fs'
import { resolveCommandConfig } from '../../core/config'
import { resolveCommandValues } from '../../core/config/resolution'
import { setMirror } from './utils'

/**
 * 根据中国大陆镜像源，自动向 VSCode settings.json 注入终端环境变量。
 */
export async function setVscodeBinaryMirror(cwd: string) {
  const mirrorConfig = resolveCommandValues('mirror', await resolveCommandConfig('mirror', cwd)).values
  const targetJsonPath = path.resolve(cwd, '.vscode/settings.json')

  await fs.ensureFile(targetJsonPath)

  const json = parse(await fs.readFile(targetJsonPath, 'utf8'), undefined, false)

  const env = mirrorConfig.env!

  json && typeof json === 'object' && setMirror(json, env)

  await fs.writeFile(targetJsonPath, `${stringify(json, undefined, 2)}\n`, 'utf8')
}
