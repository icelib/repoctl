import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)

/**
 * 用户默认看到的 CLI 名称，帮助文案和生成脚本都统一引导到 repo。
 */
export const cliName = 'repo'

/**
 * 还原出 package.json 所在的绝对路径，方便后续按目录组织资源文件。
 */
const packageJsonPath = fileURLToPath(new URL('../package.json', import.meta.url))

const packageMetadata = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { name: string, version: string }

/**
 * CLI 本身的基础信息，直接复用 package.json 里的 name/version，避免重复维护。
 */
export const packageName = packageMetadata.name
export const version = packageMetadata.version

/**
 * @icebreakers/monorepo 包的根目录。
 */
export const packageDir = path.dirname(packageJsonPath)

/**
 * CLI 提供的模板/资产目录来源于 @icebreakers/monorepo-templates。
 * 这里只解析 package.json 路径，避免 CLI 启动时加载模板包入口。
 */
const templatesPackageDir = path.dirname(require.resolve('@icebreakers/monorepo-templates/package.json'))
export const assetsDir = path.join(templatesPackageDir, 'assets')
export const templatesDir = path.join(templatesPackageDir, 'templates')

/**
 * monorepo 根目录，方便需要跳出当前包的逻辑（例如定位工作区文件）。
 */
const workspaceRootDir = path.resolve(packageDir, '..', '..')
export const rootDir = existsSync(path.join(workspaceRootDir, 'pnpm-workspace.yaml')) ? workspaceRootDir : packageDir
