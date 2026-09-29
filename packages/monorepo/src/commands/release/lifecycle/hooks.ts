import type { ReleaseCiOptions } from '../types'
import type { ReleaseLifecycleState } from './types'
import { ReleaseCommandError } from '../errors'
import { runAfterPublishHooks } from '../hooks'
import { getReleaseEnv } from '../shared'

export async function finishHooks(state: ReleaseLifecycleState, save: () => Promise<void>, options: ReleaseCiOptions) {
  const acknowledged = new Set((getReleaseEnv(options)['REPO_RELEASE_ACKNOWLEDGE_HOOKS'] ?? '').split(',').filter(Boolean))
  for (const hook of options.config?.hooks?.afterPublish ?? []) {
    const status = state.hooks[hook.script]
    if (status === 'complete' || status === 'ignored') {
      continue
    }
    if (acknowledged.has(hook.script)) {
      state.hooks[hook.script] = 'complete'
      await save()
      continue
    }
    if (status === 'running' && !hook.idempotent) {
      throw new ReleaseCommandError(`afterPublish hook ${hook.script} has an unknown outcome. Verify its external result, then set REPO_RELEASE_ACKNOWLEDGE_HOOKS=${hook.script}, or declare idempotent: true only if safe to retry`)
    }
    state.hooks[hook.script] = 'running'
    await save()
    try {
      runAfterPublishHooks(state.packages.map(({ name, version }) => ({ name, version })), {
        ...options,
        config: { ...options.config, hooks: { afterPublish: [{ ...hook, continueOnError: false }] } },
      })
      state.hooks[hook.script] = 'complete'
    }
    catch (error) {
      if (!hook.continueOnError) {
        throw error
      }
      state.hooks[hook.script] = 'ignored'
    }
    await save()
  }
}
