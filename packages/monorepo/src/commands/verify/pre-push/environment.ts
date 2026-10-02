import type { execFileSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

/** Git hooks and pnpm can export paths pointing back to the caller's checkout. */
export function createPushEnvironment(cwd: string, execFile: typeof execFileSync) {
  const localGitVariables = execFile('git', ['rev-parse', '--local-env-vars'], { cwd, encoding: 'utf8' }).trim().split('\n')
  const removed = new Set([...localGitVariables.map(key => key.toLowerCase()), 'npm_config_workspace_dir', 'npm_config_local_prefix', 'npm_config_prefix', 'npm_package_json', 'npm_lifecycle_event', 'npm_lifecycle_script', 'pnpm_script_src_dir', 'init_cwd', 'pwd', 'node_path'])
  const environment = { ...process.env }
  for (const key of Object.keys(environment)) {
    if (removed.has(key.toLowerCase())) {
      delete environment[key]
    }
    else if (key.toLowerCase() === 'path') {
      // pnpm injects the source checkout's tools into PATH. Let each command
      // discover binaries installed inside its own committed workspace.
      environment[key] = environment[key]?.split(path.delimiter).filter((directory) => {
        const relative = path.relative(cwd, path.resolve(directory))
        return !/(?:^|[/\\])node_modules[/\\]\.bin(?:[/\\]|$)/i.test(directory)
          && relative !== '' && (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
      }).join(path.delimiter)
    }
  }
  return environment
}

export function pushCommandEnvironment(environment: NodeJS.ProcessEnv, cwd: string) {
  return { ...environment, GIT_NO_REPLACE_OBJECTS: '1', HUSKY: '0', INIT_CWD: cwd, PWD: cwd }
}
