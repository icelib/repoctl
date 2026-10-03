import type { MonorepoConfig } from '../../../types'
import type { EnvCacheConfig, EnvCacheSuppression } from '../../../types/env-cache'
import type { ReleaseBranchesConfig } from '../../../types/release'
import type { Schema } from './schema'
import { array, boolean, choices, isRecord, names, nonempty, object, record, string, strings, union } from './schema'

export const dependencyTypes = array(choices('dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'))
export const toolingTargets = array(choices('commitlint', 'eslint', 'stylelint', 'lint-staged', 'tsconfig', 'vitest'))

const npmRemote = { ...object({ kind: choices('npm'), packageName: nonempty, version: nonempty, registry: nonempty }, ['kind', 'packageName', 'version']), accepts: (value: unknown) => isRecord(value) && value['kind'] === 'npm' }
const gitRemote = { ...object({ kind: choices('git'), repository: nonempty, ref: nonempty }, ['kind', 'repository', 'ref']), accepts: (value: unknown) => isRecord(value) && value['kind'] === 'git' }
const remote = union(npmRemote, gitRemote)

const template = object({ source: nonempty, target: nonempty, label: string, category: choices('app', 'docs', 'library', 'service', 'tool'), description: string, remote }, ['source', 'target'])
// Union branches that contain objects still need field validation.
const templateValue = { ...template, expected: 'nonempty string or template definition', accepts: (value: unknown) => nonempty.accepts(value) || template.accepts(value) }

const envSuppression = object({ rule: nonempty, reason: nonempty, package: nonempty, task: nonempty, variable: nonempty, path: nonempty } satisfies Record<keyof EnvCacheSuppression, Schema>, ['rule', 'reason'])
const env = object({ tasks: names, include: names, exclude: names, frameworkInference: boolean, suppressions: array(envSuppression) } satisfies Record<keyof EnvCacheConfig, Schema>)
const branches = object({
  stable: nonempty,
  maintenance: array(object({ branch: nonempty, range: nonempty, tag: nonempty }, ['branch', 'range', 'tag'])),
  prerelease: array(object({ branch: nonempty, lane: nonempty, tag: nonempty, target: nonempty }, ['branch', 'lane', 'tag'])),
} satisfies Record<keyof ReleaseBranchesConfig, Schema>)

export const commandSchemas = {
  ai: object({ output: string, baseDir: string, force: boolean, format: choices('md', 'json'), tasksFile: string }),
  clean: object({ autoConfirm: boolean, dryRun: boolean, ignorePackages: strings, includePrivate: boolean, pinnedVersion: nonempty }),
  create: object({ offline: boolean, cacheDir: nonempty, name: string, renameJson: boolean, type: nonempty, templatesDir: nonempty, templateMap: record(templateValue), choices: array(object({ value: nonempty, name: string, description: string, short: string, disabled: union(boolean, string) }, ['value'])), defaultTemplate: nonempty }),
  deps: object({ groups: array(object({ name: nonempty, workspaces: names, dependencies: names, sections: dependencyTypes, reason: nonempty, ignore: boolean }, ['name', 'workspaces', 'dependencies', 'reason'])) }),
  doctor: object({ rules: names, suppressions: array(object({ id: nonempty, reason: nonempty, path: string, expires: string }, ['id', 'reason'])) }),
  env,
  init: object({ skipReadme: boolean, skipPkgJson: boolean, skipChangeset: boolean, skipIssueTemplateConfig: boolean, tooling: toolingTargets, preset: choices('minimal', 'standard'), force: boolean }),
  mirror: object({ env: record(string) }),
  release: object({ branches, qualityScripts: names, hooks: object({ verify: names, beforeVersion: names, afterVersion: names, beforePublish: names, afterPublish: array(object({ script: nonempty, continueOnError: boolean, idempotent: boolean }, ['script'])) }) }),
  upgrade: object({ interactive: boolean, core: boolean, outDir: string, cwd: string, skipOverwrite: boolean, yes: boolean, overwrite: boolean, noOverwrite: boolean, overwriteRelease: boolean, targets: strings, mergeTargets: boolean, scripts: record(string), skipChangesetMarkdown: boolean }),
} satisfies Record<keyof NonNullable<MonorepoConfig['commands']>, Schema>
