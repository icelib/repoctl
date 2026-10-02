import process from 'node:process'

/** Prevent a disposable child workspace from rediscovering its caller's Git checkout. */
export function isolatedProcessEnvironment(ceiling: string, source: NodeJS.ProcessEnv = process.env) {
  const env = { ...source }
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) {
    delete env[name]
  }
  env['GIT_CEILING_DIRECTORIES'] = ceiling
  return env
}
