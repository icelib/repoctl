import { execFileSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
// eslint-disable-next-line e18e/ban-dependencies -- Resolve pnpm.cmd consistently on Windows and propagate build failures.
import { execa } from 'execa'
import { buildIdentity } from './identity.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
const identity = buildIdentity(process.env, sourceSha)
await execa('pnpm', ['--filter', '@icebreakers/website', 'run', 'build'], {
  cwd: root,
  env: { ...process.env, REPO_DOCS_CHANNEL: identity.channel },
  stdio: 'inherit',
})
await writeFile(path.join(root, 'templates/vitepress/.vitepress/dist/docs-build.json'), `${JSON.stringify(identity)}\n`)
