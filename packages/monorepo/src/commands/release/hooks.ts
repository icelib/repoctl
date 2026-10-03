import type { ReleaseCommandConfig } from '../../types/config'
import type { PublishedPackage, ReleaseOptions } from './types'
import process from 'node:process'
import path from 'pathe'
import { resolveCommandValues } from '../../core/config/resolution'
import { logger } from '../../core/logger'
import { ReleaseCommandError } from './errors'
import { run } from './shared'
import { assertWorkspaceDependencyProtocols } from './workspace-protocol'

type ReleaseHookPhase = Exclude<keyof NonNullable<ReleaseCommandConfig['hooks']>, 'afterPublish' | 'verify'>

function validateScriptName(script: string) {
  const normalizedScript = script.trim()
  if (!normalizedScript) {
    throw new ReleaseCommandError('release script name must not be empty')
  }
  return normalizedScript
}

function runScripts(scripts: string[], options: ReleaseOptions, extraEnv?: NodeJS.ProcessEnv) {
  for (const script of scripts) {
    run('pnpm', ['run', validateScriptName(script)], {
      ...options,
      ...(extraEnv
        ? {
            env: {
              ...(options.env ?? process.env),
              ...extraEnv,
            },
          }
        : {}),
    })
  }
}

export async function runQualityScripts(options: ReleaseOptions) {
  await assertWorkspaceDependencyProtocols(options.cwd)
  const config = resolveCommandValues('release', options.config).values
  runScripts(config.qualityScripts!, options)
  runScripts(config.hooks?.verify ?? [], options)
}

export function runReleaseHooks(phase: ReleaseHookPhase, options: ReleaseOptions) {
  runScripts(options.config?.hooks?.[phase] ?? [], options)
}

export function runAfterPublishHooks(packages: PublishedPackage[], options: ReleaseOptions) {
  if (!packages.length) {
    return
  }

  const extraEnv = {
    REPO_RELEASE_PUBLISHED_PACKAGES: JSON.stringify(packages),
    REPO_RELEASE_PUBLISH_SUMMARY: path.resolve(options.cwd, 'pnpm-publish-summary.json'),
  }
  for (const hook of options.config?.hooks?.afterPublish ?? []) {
    try {
      runScripts([hook.script], options, extraEnv)
    }
    catch (error) {
      if (!hook.continueOnError) {
        throw error
      }
      logger.warn(`release afterPublish hook failed and was ignored: ${hook.script}`)
    }
  }
}
