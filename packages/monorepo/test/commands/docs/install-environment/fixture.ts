import type { DocsChannel } from '@icebreakers/monorepo/docs-context'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { commit, fixture, makeRecord, put } from '../helpers'

interface Event {
  stage: 'install' | 'build' | 'deploy'
  context: { channel: DocsChannel, origin: string }
  metadata: Record<string, string>
}

export async function lifecycleFixture(channel: DocsChannel) {
  const h = await fixture()
  const packageManager = (JSON.parse(readFileSync(new URL('../../../../../../package.json', import.meta.url), 'utf8')) as { packageManager: string }).packageManager
  await put(h.cwd, 'package.json', JSON.stringify({
    name: 'docs-lifecycle-fixture',
    private: true,
    type: 'module',
    packageManager,
    scripts: {
      'postinstall': 'node scripts/lifecycle.mjs install',
      'docs:build': 'node scripts/lifecycle.mjs build',
      'docs:preview': 'node scripts/lifecycle.mjs deploy',
      'docs:stable': 'node scripts/lifecycle.mjs deploy',
    },
  }))
  await put(h.cwd, 'pnpm-workspace.yaml', 'packages:\n  - packages/*\n')
  // pnpm 12 freezes its own toolchain in the first YAML document too.
  const managerLock = readFileSync(new URL('../../../../../../pnpm-lock.yaml', import.meta.url), 'utf8').split('\n---\n')[0]
  await put(h.cwd, 'pnpm-lock.yaml', `${managerLock}
---
lockfileVersion: '9.0'
settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false
importers:
  .: {}
  packages/core:
    dependencies:
      runtime:
        specifier: workspace:*
        version: link:../runtime
  packages/runtime: {}
`)
  // The lifecycle executes the delivered pure context API in real Node children.
  const contextEntry = new URL('../../../../dist/docs-context-entry.mjs', import.meta.url).href
  await put(h.cwd, 'scripts/lifecycle.mjs', `import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import process from 'node:process'
import { resolveDocsContext } from ${JSON.stringify(contextEntry)}

const stage = process.argv[2]
const companion = stage === 'install'
const context = stage === 'deploy'
  ? JSON.parse(readFileSync('website/output.json', 'utf8'))
  : resolveDocsContext({
      channel: process.env.REPO_DOCS_CHANNEL,
      url: process.env.REPO_DOCS_URL,
      previewOrigin: companion ? 'https://preview.companion.invalid' : 'https://next.example.invalid',
      stableOrigin: companion ? 'https://companion.invalid' : 'https://docs.example.invalid',
    })
const metadata = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^REPO_DOCS_/i.test(key)))
appendFileSync(process.env.DOCS_TEST_EVENTS, JSON.stringify({ stage, context, metadata }) + '\\n')
if (process.env.DOCS_TEST_FAILURE === stage) {
  throw new Error('Lifecycle failure: ' + stage)
}
if (stage === 'build') {
  writeFileSync('website/output.json', JSON.stringify(context))
}
if (stage === 'deploy') {
  writeFileSync(process.env.REPO_DOCS_RESULT_FILE, JSON.stringify({ versionId: 'lifecycle-version', url: context.origin }))
}
`)
  const sourceSha = commit(h.cwd)
  const record = makeRecord(sourceSha)
  await h.store.github.writeAutomationState(`releases/${record.id}`, record)
  const eventsFile = path.join(h.cwd, 'events.jsonl')
  await put(h.cwd, 'events.jsonl', '')
  const { release: _release, ...options } = h.options
  return {
    ...h,
    sourceSha,
    record,
    events: () => readFileSync(eventsFile, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line) as Event),
    options: {
      ...options,
      channel,
      ...(channel === 'stable' ? { release: record.id } : { sourceSha }),
      env: {
        ...options.env,
        DOCS_TEST_EVENTS: eventsFile,
        REPO_DOCS_SITE: 'old-site',
        REPO_DOCS_CHANNEL: 'stable',
        REPO_DOCS_SOURCE_SHA: 'old-source',
        REPO_DOCS_RELEASE_ID: 'old-release',
        REPO_DOCS_DEPLOYMENT_ID: 'old-deployment',
        REPO_DOCS_URL: 'https://old.invalid',
        REPO_DOCS_RESULT_FILE: 'old-result.json',
        REPO_DOCS_CONCURRENCY_GROUP: `docs-website-${channel}`,
        repo_docs_custom: 'old-custom-metadata',
        Repo_Docs_Url: 'https://old-mixed-case.invalid',
      },
    },
  }
}
