import type { ReleaseCommandConfig } from '../../types/config'
import type { PublishedPackage, ReleaseOptions } from './types'
import process from 'node:process'
import path from 'pathe'
import { resolveCommandValues } from '../../core/config/resolution'
import { logger } from '../../core/logger'
import { ReleaseCommandError } from './errors'
import { run } from './shared'
import { hasVerification } from './stages/verification'
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

function verificationEnvironment(options: ReleaseOptions) {
  const env = { ...(options.env ?? process.env) }
  // Release routing and recovery decisions belong to the orchestrator, not
  // validation scripts that may exercise release commands in other workspaces.
  for (const variable of [
    'REPO_RELEASE_MODE',
    'REPO_RELEASE_PACKAGE',
    'REPO_RELEASE_VERSION',
    'REPO_RELEASE_DRY_RUN',
    'REPO_RELEASE_RECOVERY_SOURCE_SHA',
    'REPO_RELEASE_SOURCE_SHA',
    'REPO_RELEASE_ACKNOWLEDGE_HOOKS',
  ]) {
    delete env[variable]
  }
  return env
}

export async function runQualityScripts(options: ReleaseOptions) {
  if (hasVerification(options)) {
    return
  }
  await assertWorkspaceDependencyProtocols(options.cwd)
  const config = resolveCommandValues('release', options.config).values
  const verificationOptions = { ...options, env: verificationEnvironment(options) }
  runScripts(config.qualityScripts!, verificationOptions)
  runScripts(config.hooks?.verify ?? [], verificationOptions)
}

export function runReleaseHooks(phase: ReleaseHookPhase, options: ReleaseOptions) {
  if (phase === 'beforeVersion' && hasVerification(options)) {
    return
  }
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
