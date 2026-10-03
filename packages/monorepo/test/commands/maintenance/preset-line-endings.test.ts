import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { prepareMaintenanceUpgrade } from '@icebreakers/monorepo'
import { expect, it } from 'vitest'
import { digest } from './fixture'
import { presetBytes, presetFixture, presetTarget } from './preset-fixture'

const { validateMaintenanceArtifact } = await import(new URL('../../../resources/maintenance/validate.mjs', import.meta.url).href)

it.each([
  { autocrlf: 'true', attributes: '', crlf: true },
  { autocrlf: 'false', attributes: '', crlf: false },
  { autocrlf: 'false', attributes: '* text=auto eol=crlf\n', crlf: true },
])('publishes preset plans with raw checkout bytes across Git conversions: %j', async ({ autocrlf, attributes, crlf }) => {
  const h = await presetFixture({ lineEnding: 'crlf' })
  h.git(['config', 'core.autocrlf', 'true'])
  if (attributes) {
    await h.write('.gitattributes', attributes)
    h.git(['add', '.gitattributes'])
  }
  h.git(['add', '--renormalize', '.'])
  h.git(['-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-qm', 'normalize committed preset blobs'])
  const head = h.git(['rev-parse', 'HEAD'])
  for (const filename of [presetTarget, h.baselinePath]) {
    await rm(path.join(h.cwd, filename))
    h.git(['checkout', '--', filename])
  }
  const before = await readFile(path.join(h.cwd, presetTarget))
  const report = await prepareMaintenanceUpgrade({ ...h.options, head })
  expect(report.status, report.errors.join()).toBe('ready')
  expect(report.presets?.plan?.files[0]?.beforeHash).toBe(digest(before))
  const canonical = presetBytes.replace('first = 1', 'first = 10').replace('fourth = 4', 'fourth = 40')
  expect(report.files.find(file => file.path === presetTarget)?.afterHash).toBe(digest(canonical))
  const cwd = path.join(h.root, 'publisher')
  h.git(['clone', '-q', '--no-hardlinks', '--config', `core.autocrlf=${autocrlf}`, h.cwd, cwd], h.root)
  const request = async (route: string) => {
    const response = await h.request(route)
    return { data: { ...response.data, ...(route.endsWith('/branches/{branch}') ? { commit: { sha: head } } : {}), ...(route.endsWith('/actions/artifacts/{artifact_id}') ? { workflow_run: { id: 123, head_sha: head } } : {}) } }
  }
  const result = await validateMaintenanceArtifact({ cwd, directory: h.options.outputDirectory, expected: { ...h.expected, head }, request })
  expect(result.ready).toBe(true)
  expect(h.gitBytes(['show', `:${presetTarget}`], cwd).toString()).toBe(canonical)
  expect(await readFile(path.join(cwd, presetTarget), 'utf8')).toBe(crlf ? canonical.replaceAll('\n', '\r\n') : canonical)
})
