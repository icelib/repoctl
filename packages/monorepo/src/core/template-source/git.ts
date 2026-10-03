import type { ResolvedTemplateRemoteSource, TemplateRemoteSource } from '@icebreakers/monorepo-templates'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { isolatedProcessEnvironment } from '../process-environment'

const run = promisify(execFile)

export async function downloadGitTemplate(source: Extract<TemplateRemoteSource, { kind: 'git' }>, directory: string, timeout: number): Promise<{ archive: string, prefix: string, resolved: ResolvedTemplateRemoteSource }> {
  const repository = path.join(directory, 'repository.git')
  const hooks = path.join(directory, 'empty-hooks')
  const archive = path.join(directory, 'archive.tar')
  await mkdir(hooks)
  const env = { ...isolatedProcessEnvironment(directory), GIT_TERMINAL_PROMPT: '0' }
  const config = ['-c', `core.hooksPath=${hooks}`, '-c', 'protocol.file.allow=always']
  try {
    await run('git', [...config, 'init', '--bare', repository], { env, timeout, maxBuffer: 1024 * 1024 })
    const args = [...config, '--git-dir', repository]
    await run('git', [...args, 'fetch', '--no-tags', '--depth=1', '--no-recurse-submodules', source.repository, source.ref], { env, timeout, maxBuffer: 1024 * 1024 })
    const result = await run('git', [...args, 'rev-parse', '--verify', 'FETCH_HEAD^{commit}'], { env, timeout, maxBuffer: 1024 * 1024 })
    const commit = result.stdout.trim()
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(commit)) {
      throw new Error('Invalid commit identity.')
    }
    await run('git', [...args, 'archive', '--format=tar', '--prefix=template/', `--output=${archive}`, commit], { env, timeout, maxBuffer: 1024 * 1024 })
    if ((await lstat(archive)).size > 64 * 1024 * 1024) {
      throw new Error('Template archive exceeds 64 MiB.')
    }
    const integrity = `sha256-${createHash('sha256').update(await readFile(archive)).digest('base64')}`
    return { archive, prefix: 'template', resolved: { kind: 'git', repository: source.repository, requestedRef: source.ref, commit, integrity } }
  }
  catch {
    throw new Error('Git template download failed. Verify the repository and ref, network access and Git credential helper or SSH agent; no target files were created.')
  }
}
