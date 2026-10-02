import type { ToolingConfig } from '../../../types'
import type { Schema } from './schema'
import { array, boolean, object, opaque, positive, record, string, strings, union } from './schema'

export const toolingSchema = object({
  projectReferences: object({ enabled: boolean, root: string, projects: strings, exclude: strings, relations: array(object({ source: string, target: string }, ['source', 'target'])) }),
  commitlint: opaque,
  eslint: opaque,
  stylelint: opaque,
  lintStaged: object({ repoCommand: string, config: opaque }),
  tsconfig: object({ extends: union(string, strings), compilerOptions: record(opaque), include: strings, exclude: strings, files: strings, references: array(object({ path: string }, ['path'])), compileOnSave: boolean }),
  vitest: object({ rootDir: string, projectRoots: strings, configCandidates: strings, workspaceFile: string, includeWorkspaceRootConfig: boolean, coverageExclude: strings, coverageEnabled: boolean, coverageAll: boolean, coverageSkipFull: boolean, overrides: opaque }),
  vitestProject: object({ alias: array(object({ find: { expected: 'string | RegExp', accepts: value => typeof value === 'string' || value instanceof RegExp }, replacement: string }, ['find', 'replacement'])), globals: boolean, testTimeout: positive, environment: string }),
  husky: object({ preCommitCommand: string, commitMsgCommand: string }),
} satisfies Record<keyof ToolingConfig, Schema>)
