import { readFileSync, writeFileSync } from 'node:fs'
import { lstat, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { prepareMaintenanceUpgrade } from '@icebreakers/monorepo'
import { expect, it } from 'vitest'
import { digest, fixture, lockfile } from './fixture'

const { validateMaintenanceArtifact } = await import(new URL('../../../resources/maintenance/validate.mjs', import.meta.url).href)

it.each([
  { autocrlf: 'true', attributes: '', crlf: true },
  { autocrlf: 'false', attributes: '', crlf: false },
  { autocrlf: 'false', attributes: '* text=auto eol=crlf\n', crlf: true },
])('verifies Git blobs across checkout conversions: %j', async ({ autocrlf, attributes, crlf }) => {
  const h = await fixture()
  h.git(['config', 'core.autocrlf', 'true'])
  if (attributes) {
    await h.write('.gitattributes', attributes)
    h.git(['add', '.gitattributes'])
    h.git(['-c', 'commit.gpgsign=false', 'commit', '-qm', 'declare checkout line endings'])
  }
  const head = h.git(['rev-parse', 'HEAD'])
  const canonical = `${lockfile(h.version)}# validated resolution\n`
  const spawn = ((command: string, args: string[]) => {
    if (args.includes('--lockfile-only')) {
      writeFileSync(path.join(h.cwd, 'pnpm-lock.yaml'), canonical.replaceAll('\n', '\r\n'))
    }
    return h.spawn(command, args)
  }) as typeof h.spawn
  const report = await prepareMaintenanceUpgrade({ ...h.options, head, spawn })
  expect(report.status, report.errors.join()).toBe('ready')
  expect(readFileSync(path.join(h.cwd, 'pnpm-lock.yaml'), 'utf8')).toBe(canonical.replaceAll('\n', '\r\n'))
  expect(report.files.find(file => file.path === 'pnpm-lock.yaml')?.afterHash).toBe(digest(canonical))
  const editorconfig = report.plan?.files.find(file => file.path === '.editorconfig')
  expect(editorconfig?.afterHash).toBe(digest(await readFile(path.join(h.cwd, '.editorconfig'))))
  const cwd = path.join(h.root, 'publisher')
  h.git(['clone', '-q', '--no-hardlinks', '--config', `core.autocrlf=${autocrlf}`, h.cwd, cwd], h.root)
  const request = async (route: string) => {
    const response = await h.request(route)
    if (route.endsWith('/branches/{branch}')) {
      return { data: { ...response.data, commit: { sha: head } } }
    }
    if (route.endsWith('/actions/artifacts/{artifact_id}')) {
      return { data: { ...response.data, workflow_run: { id: 123, head_sha: head } } }
    }
    return response
  }
  const result = await validateMaintenanceArtifact({ cwd, directory: h.options.outputDirectory, expected: { ...h.expected, head }, request })
  expect(result.ready).toBe(true)
  expect(h.gitBytes(['show', ':pnpm-lock.yaml'], cwd).toString()).toBe(canonical)
  expect(await readFile(path.join(cwd, 'pnpm-lock.yaml'), 'utf8')).toBe(crlf ? canonical.replaceAll('\n', '\r\n') : canonical)
  expect(h.git(['diff', '--exit-code', '--no-ext-diff', '--no-textconv'], cwd)).toBe('')
})

it('disables executable Git filters and fsmonitor before inspecting and applying the patch', async () => {
  const h = await fixture()
  const report = await prepareMaintenanceUpgrade(h.options)
  expect(report.status, report.errors.join()).toBe('ready')
  const cwd = path.join(h.root, 'publisher')
  h.git(['clone', '-q', '--no-hardlinks', h.cwd, cwd], h.root)
  const marker = path.join(h.root, 'git-program-ran')
  const script = path.join(h.root, 'git-program.cjs')
  await writeFile(script, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran'); process.stdin.pipe(process.stdout)\n`)
  const command = [process.execPath, script].map(filename => JSON.stringify(filename.replaceAll('\\', '/'))).join(' ')
  for (const setting of ['clean', 'smudge', 'process']) {
    h.git(['config', `filter.fixture.${setting}`, command], cwd)
  }
  h.git(['config', 'filter.fixture.required', 'true'], cwd)
  h.git(['config', 'core.fsmonitor', command], cwd)
  await writeFile(path.join(cwd, '.git/info/attributes'), '* filter=fixture\n')
  const result = await validateMaintenanceArtifact({ cwd, directory: h.options.outputDirectory, expected: h.expected, request: h.request })
  expect(result.ready).toBe(true)
  expect(await lstat(marker).catch(() => null)).toBeNull()
  for (const setting of ['clean', 'smudge', 'process']) {
    expect(h.git(['config', '--local', `filter.fixture.${setting}`], cwd)).toBe('')
  }
  expect(h.git(['config', '--local', 'filter.fixture.required'], cwd)).toBe('false')
  expect(h.git(['config', '--local', 'core.fsmonitor'], cwd)).toBe('false')
  h.git(['status', '--porcelain'], cwd)
  h.git(['add', '-A'], cwd)
  expect(await lstat(marker).catch(() => null)).toBeNull()
})
