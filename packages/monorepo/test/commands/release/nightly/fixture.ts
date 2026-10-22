import type { NightlyOptions, NightlyReport } from '@icebreakers/monorepo'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { vi } from 'vitest'
import { fixture as snapshotFixture } from '../snapshot/fixture'

export const schedule = '17 19 * * *'
export const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })

export async function fixture(eventName = 'workflow_dispatch') {
  const h = await snapshotFixture()
  const event = { repository: { full_name: 'acme/repo', default_branch: 'main' }, inputs: { mode: 'nightly' }, schedule }
  const env: NodeJS.ProcessEnv & { GITHUB_EVENT_PATH: string, GITHUB_STEP_SUMMARY: string } = { ...h.options.env, GITHUB_EVENT_PATH: h.env.GITHUB_EVENT_PATH, GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: eventName, GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', GITHUB_STEP_SUMMARY: path.join(h.root, 'summary') }
  await writeFile(env['GITHUB_EVENT_PATH']!, JSON.stringify(event))
  const registryFetch = vi.fn<typeof fetch>(async () => json({}, 404))
  const options: NightlyOptions = { cwd: h.cwd, env, registryFetch, spawn: h.options.spawn!, outputDirectory: path.join(h.root, 'nightly'), config: { nightly: { schedule }, qualityScripts: ['build'] }, sleep: async () => {} }
  return { ...h, options, env, event, registryFetch }
}

export function npmMetadata(report: NightlyReport, name: string) {
  const snapshot = report.snapshot!
  const pkg = snapshot.packages.find(item => item.name === name)!
  return { name, version: pkg.version, repoctlSnapshot: { ...snapshot.identity, identityKey: snapshot.identityKey, tag: snapshot.tag }, dist: { integrity: `sha512-${'A'.repeat(86)}==` } }
}

export function npmFetch(report: NightlyReport, transform: (name: string, metadata: ReturnType<typeof npmMetadata>) => unknown = (_name, metadata) => metadata) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input))
    if (url.pathname.startsWith('/-/package/')) {
      const name = decodeURIComponent(url.pathname.split('/')[3]!)
      const metadata = transform(name, npmMetadata(report, name)) as ReturnType<typeof npmMetadata> | null
      return json(metadata ? { 'latest': '1.0.0', 'snapshot-nightly': metadata.version } : { latest: '1.0.0' })
    }
    const name = decodeURIComponent(url.pathname.split('/')[1]!)
    return json(transform(name, npmMetadata(report, name)))
  })
}
