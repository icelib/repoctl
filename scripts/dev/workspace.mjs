import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout } from 'node:timers/promises'

export async function temporaryWorkspace(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'repoctl-dev-'))
  t.onTestFinished(() => rm(directory, { recursive: true, force: true }))
  return directory
}

export async function waitFor(check, description, output = () => '') {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (await check()) {
      return
    }
    await setTimeout(100)
  }
  throw new Error(`Timed out waiting for ${description}\n${output()}`)
}
