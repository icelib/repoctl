import { existsSync } from 'node:fs'
import path from 'node:path'
import { shouldSkipTemplatePath } from '@icebreakers/monorepo-templates'
import { simpleGit } from 'simple-git'
import { templateMap } from '../../src/commands/create'
import { rootDir } from '../../src/constants'

const git = simpleGit(rootDir)
const templatePrefix = /^templates[\\/]/
async function getTrackedFilesInDir(dir: string) {
  const result = await git.raw([
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '-z',
    dir,
  ])
  return result.split('\0').filter(entry => entry && existsSync(path.resolve(rootDir, entry))).sort((left, right) => left.localeCompare(right))
}
export async function getTemplateTargets() {
  return Promise.all(
    Object.values(templateMap).map((definition) => {
      const sourceDir = path.resolve(rootDir, 'templates', definition.source)
      return getTrackedFilesInDir(sourceDir).then((entries) => {
        return entries.filter((entry) => {
          const targetPath = path.resolve(rootDir, entry)
          return !shouldSkipTemplatePath(sourceDir, targetPath)
        })
      })
    }),
  ).then(x => x.flat(1).map(entry => entry.replace(templatePrefix, '')))
}
