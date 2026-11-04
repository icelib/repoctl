import process from 'node:process'
import { ensureTemplateAssetsPrepared } from '@icebreakers/monorepo-templates'

// 测试默认模拟无发布权限的本地进程；事件和凭据拒绝用例在 setup 后显式注入环境。
for (const variable of [
  'GITHUB_EVENT_NAME',
  'GITHUB_EVENT_PATH',
  'GITHUB_REF_NAME',
  'GITHUB_SHA',
  'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
  'ACTIONS_ID_TOKEN_REQUEST_URL',
  'NODE_AUTH_TOKEN',
  'NPM_TOKEN',
  'REPOCTL_BOOTSTRAP_RUNNING',
]) {
  delete process.env[variable]
}

// Use the runtime readiness contract, including stale metadata and its shared lock.
// eslint-disable-next-line antfu/no-top-level-await
await ensureTemplateAssetsPrepared()
