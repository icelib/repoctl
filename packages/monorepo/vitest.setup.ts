import process from 'node:process'
import { ensureTemplateAssetsPrepared } from '@icebreakers/monorepo-templates'

// GitHub runner metadata must not silently change tests that exercise local
// release behavior. Tests for GitHub events provide their own explicit env.
for (const variable of ['GITHUB_EVENT_NAME', 'GITHUB_EVENT_PATH', 'GITHUB_REF_NAME', 'GITHUB_SHA']) {
  delete process.env[variable]
}

// Use the runtime readiness contract, including stale metadata and its shared lock.
// eslint-disable-next-line antfu/no-top-level-await
await ensureTemplateAssetsPrepared()
