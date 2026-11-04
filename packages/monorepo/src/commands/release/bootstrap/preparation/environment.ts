import type { BootstrapOptions } from '../types'
import process from 'node:process'

/** 在加载候选配置前同时检查当前进程与子进程环境，禁止凭据泄漏和递归准备。 */
export function assertBootstrapPreparationEnvironment(options: Pick<BootstrapOptions, 'env'>) {
  const environments = options.env ? [process.env, options.env] : [process.env]
  if (environments.some(env => env['REPOCTL_BOOTSTRAP_RUNNING'])) {
    throw new Error('Bootstrap cannot run recursively from a candidate build or pack lifecycle.')
  }
  if (environments.some(env => ['ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'NODE_AUTH_TOKEN', 'NPM_TOKEN'].some(key => env[key]))) {
    throw new Error('Bootstrap preparation must run without OIDC or npm publishing credentials.')
  }
}
