import type { DocsOptions } from '@icebreakers/monorepo'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { deployDocs } from '@icebreakers/monorepo'
import { resolveDocsContext } from '@icebreakers/monorepo/docs-context'
import crossSpawn from 'cross-spawn'
import { afterEach, expect, it } from 'vitest'
import { cleanup, commit, fixture, makeRecord, put } from './helpers'

afterEach(cleanup)

const unrelatedOrigins = { previewOrigin: 'https://preview.nimbus.example.invalid', stableOrigin: 'https://nimbus.example.invalid' }
const websiteOrigins = { previewOrigin: 'https://next.example.invalid', stableOrigin: 'https://docs.example.invalid' }

it.each(['preview', 'stable'] as const)('isolates %s deployment context from real installation lifecycle subprocesses', async (channel) => {
  const h = await fixture()
  const packageManager = JSON.parse(readFileSync(new URL('../../../../../package.json', import.meta.url), 'utf8')).packageManager
  await put(h.cwd, 'package.json', JSON.stringify({
    name: 'docs-environment-fixture',
    private: true,
    packageManager,
    scripts: {
      'postinstall': 'node lifecycle.mjs install',
      'docs:build': 'node lifecycle.mjs build',
      'docs:preview': 'node lifecycle.mjs provider',
      'docs:stable': 'node lifecycle.mjs provider',
    },
  }))
  await put(h.cwd, 'lifecycle.mjs', `
    import { appendFileSync, writeFileSync } from 'node:fs'
    import { resolveDocsContext } from ${JSON.stringify(import.meta.resolve('@icebreakers/monorepo/docs-context'))}
    const stage = process.argv[2]
    const origins = stage === 'install' ? ${JSON.stringify(unrelatedOrigins)} : ${JSON.stringify(websiteOrigins)}
    const context = resolveDocsContext({ ...origins, channel: process.env.REPO_DOCS_CHANNEL, url: process.env.REPO_DOCS_URL })
    const docs = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase().startsWith('REPO_DOCS_')))
    appendFileSync(process.env.DOCS_TEST_OBSERVATIONS, JSON.stringify({
      stage, context, docs, lifecycle: process.env.npm_lifecycle_event,
      ci: process.env.CI, registry: process.env.npm_config_registry, lefthook: process.env.LEFTHOOK,
    }) + '\\n')
    if (stage === 'provider') {
      writeFileSync(process.env.REPO_DOCS_RESULT_FILE, JSON.stringify({ versionId: 'lifecycle-version', url: context.origin }))
    }
  `)
  const sourceSha = commit(h.cwd)
  const record = makeRecord(sourceSha)
  await h.store.github.writeAutomationState(`releases/${record.id}`, record)
  const observations = path.join(h.cwd, 'observations.jsonl')
  const env = {
    ...h.options.env,
    CI: 'true',
    LEFTHOOK: '1',
    COREPACK_ENABLE_NETWORK: '0',
    COREPACK_ENABLE_AUTO_PIN: '0',
    npm_config_registry: 'https://registry.example.invalid',
    DOCS_TEST_OBSERVATIONS: observations,
    REPO_DOCS_CONCURRENCY_GROUP: `docs-website-${channel}`,
    REPO_DOCS_SITE: 'ambient-site',
    REPO_DOCS_CHANNEL: 'ambient-invalid-channel',
    REPO_DOCS_SOURCE_SHA: 'ambient-source',
    REPO_DOCS_TREE_SHA: 'ambient-tree',
    REPO_DOCS_RELEASE_ID: 'ambient-release',
    REPO_DOCS_DEPLOYMENT_ID: 'ambient-deployment',
    REPO_DOCS_URL: 'https://ambient.example.invalid',
    REPO_DOCS_RESULT_FILE: 'ambient-result',
    REPO_DOCS_FUTURE_CONTROL: 'ambient-control',
    repo_docs_mixed_case: 'ambient-control',
  }
  const originalEnv = { ...env }
  const calls: string[][] = []
  const children: Array<{ status: number | null, error: string | undefined, stderr: string }> = []
  const spawn = ((command: string, args: string[], input: { cwd: string, env: NodeJS.ProcessEnv }) => {
    calls.push([command, ...args])
    // Exercise an actual pnpm lifecycle without installing dependencies or accessing a registry.
    const lifecycleArgs = args[0] === 'install' ? ['run', 'postinstall'] : args
    const result = crossSpawn.sync(process.env['npm_execpath'] ?? command, ['--config.manage-package-manager-versions=false', ...lifecycleArgs], {
      cwd: input.cwd,
      env: input.env,
      encoding: 'utf8',
      timeout: 30_000,
      windowsHide: true,
    })
    children.push({ status: result.status, error: result.error?.message, stderr: result.stderr })
    return result
  }) as NonNullable<DocsOptions['spawn']>
  const { release: _release, ...options } = h.options
  const deployed = await deployDocs({
    ...options,
    channel,
    ...(channel === 'preview' ? { sourceSha } : { release: record.id }),
    env,
    spawn,
  }).catch(error => error)
  expect(children, JSON.stringify(children)).toEqual([
    expect.objectContaining({ status: 0, error: undefined }),
    expect.objectContaining({ status: 0, error: undefined }),
    expect.objectContaining({ status: 0, error: undefined }),
  ])
  expect(deployed).toMatchObject({ status: 'deployed', versionId: 'lifecycle-version' })
  expect(calls).toEqual([
    ['pnpm', 'install', '--frozen-lockfile'],
    ['pnpm', 'run', 'docs:build'],
    ['pnpm', 'run', `docs:${channel}`],
  ])
  expect(env).toEqual(originalEnv)
  const [install, build, provider] = readFileSync(observations, 'utf8').trim().split('\n').map(line => JSON.parse(line))
  expect(install).toEqual({
    stage: 'install',
    lifecycle: 'postinstall',
    context: resolveDocsContext(unrelatedOrigins),
    docs: {},
    ci: 'true',
    registry: env.npm_config_registry,
    lefthook: '0',
  })
  for (const result of [build, provider]) {
    expect(result.context).toEqual(resolveDocsContext({ ...websiteOrigins, channel }))
    expect(result.docs).toMatchObject({
      REPO_DOCS_SITE: 'website',
      REPO_DOCS_CHANNEL: channel,
      REPO_DOCS_SOURCE_SHA: sourceSha,
      REPO_DOCS_TREE_SHA: deployed.plan.treeSha,
      REPO_DOCS_RELEASE_ID: channel === 'stable' ? record.id : '',
      REPO_DOCS_DEPLOYMENT_ID: deployed.plan.deploymentId,
      REPO_DOCS_URL: websiteOrigins[channel === 'preview' ? 'previewOrigin' : 'stableOrigin'],
      REPO_DOCS_RESULT_FILE: expect.stringContaining('deployment-result.json'),
    })
    expect(result.lefthook).toBe('0')
  }
  expect(provider.docs).toEqual(build.docs)
}, 90_000)
