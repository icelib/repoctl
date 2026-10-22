import path from 'node:path'

export function consumerEnvironment(env: NodeJS.ProcessEnv, directory: string): NodeJS.ProcessEnv {
  const inherited = Object.fromEntries(['PATH', 'HOME', 'USERPROFILE', 'TMPDIR', 'TMP', 'TEMP', 'SystemRoot', 'SYSTEMROOT', 'ComSpec', 'PATHEXT']
    .filter(name => typeof env[name] === 'string').map(name => [name, env[name]]))
  return {
    ...inherited,
    CI: 'true',
    NO_COLOR: '1',
    COREPACK_ENABLE_AUTO_PIN: '0',
    COREPACK_ENABLE_NETWORK: '0',
    npm_config_registry: 'https://registry.npmjs.org/',
    npm_config_userconfig: path.join(directory, 'user.npmrc'),
    npm_config_globalconfig: path.join(directory, 'global.npmrc'),
  }
}

export const consumerPnpmOptions = ['--config.pm-on-fail=ignore', '--config.runtime-on-fail=ignore', '--config.manage-package-manager-versions=false', '--config.ignore-pnpmfile=true']
