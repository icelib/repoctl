import type { PackageJson } from '../../../types'
import path from 'node:path'
import { getRepoctlConfigCandidates } from '../../../core/config'
import fs from '../../../utils/fs'
import { legacyStagedConfigNames } from '../../../utils/legacy-hooks'

const defaultHookCommands: Record<string, string[]> = {
  'pre-commit': ['pnpm exec repo verify pre-commit', 'pnpm exec lint-staged'],
  'commit-msg': ['pnpm exec repo verify commit-msg "$1"', 'pnpm exec commitlint --edit "$1"'],
  'pre-push': ['pnpm lint\npnpm typecheck'],
}
const wrapperPattern = /^import\s*\{\s*defineLintStagedConfig\s*\}\s*from\s*['"](?:repoctl|@icebreakers\/monorepo)\/tooling['"];?\s*export default await defineLintStagedConfig\(\);?$/
const defaultToolingPattern = /\b(?:lintStaged|husky)\s*:\s*\{\s*(?:(?:repoCommand|monorepoCommand)\s*:\s*['"]pnpm exec repo['"]\s*(?:,\s*)?)?\}\s*,?/g
const legacyToolingPattern = /\b(?:lintStaged|husky)['"]?\s*:/

export function removeDefaultHookTooling(content: string) {
  return content.replace(defaultToolingPattern, '')
}

function normalizeHook(content: string) {
  return content.split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && line !== 'set -e' && line !== '. "$(dirname "$0")/_/husky.sh"')
    .join('\n')
}

export async function inspectLegacyHooks(cwd: string, pkg: PackageJson) {
  const files: string[] = []
  let custom = Boolean(pkg['lint-staged'] || pkg['husky'])
  const huskyDir = path.join(cwd, '.husky')
  if (await fs.pathExists(huskyDir)) {
    for (const entry of await fs.readdir(huskyDir)) {
      if (entry === '_' || entry === '.gitignore') {
        continue
      }
      const file = `.husky/${entry}`
      files.push(file)
      if (!defaultHookCommands[entry] || !(await fs.stat(path.join(cwd, file))).isFile()) {
        custom = true
        continue
      }
      custom ||= !defaultHookCommands[entry]!.includes(normalizeHook(await fs.readFile(path.join(cwd, file), 'utf8')))
    }
  }
  for (const file of legacyStagedConfigNames) {
    if (await fs.pathExists(path.join(cwd, file))) {
      files.push(file)
      custom ||= file !== 'lint-staged.config.js' || !wrapperPattern.test((await fs.readFile(path.join(cwd, file), 'utf8')).trim())
    }
  }
  const prepare = pkg.scripts?.['prepare']
  const defaultPrepare = prepare === 'husky' || prepare === 'husky install'
  const hasDependencies = [pkg.dependencies, pkg.devDependencies].some(group => ['husky', 'lint-staged'].some(name => group?.[name]))
  custom ||= Boolean(prepare && !defaultPrepare && (hasDependencies || files.length > 0 || prepare.includes('husky')))
  for (const candidate of getRepoctlConfigCandidates(cwd).filter(file => !file.endsWith('/repoctl.config.ts') && !file.endsWith('\\repoctl.config.ts'))) {
    if (await fs.pathExists(candidate)) {
      custom ||= hasDependencies || files.length > 0 || defaultPrepare || legacyToolingPattern.test(await fs.readFile(candidate, 'utf8'))
    }
  }
  const configPath = path.join(cwd, 'repoctl.config.ts')
  const config = await fs.pathExists(configPath) ? await fs.readFile(configPath, 'utf8') : undefined
  custom ||= config !== undefined && legacyToolingPattern.test(removeDefaultHookTooling(config))
  const legacy = files.length > 0 || defaultPrepare || hasDependencies || custom
  return { legacy, custom, files, config }
}
