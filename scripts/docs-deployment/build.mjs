import { fileURLToPath } from 'node:url'
// eslint-disable-next-line e18e/ban-dependencies -- Resolve pnpm.cmd consistently on Windows and propagate build failures.
import { execa } from 'execa'

const root = fileURLToPath(new URL('../../', import.meta.url))
await execa('pnpm', ['--filter', '@icebreakers/website', 'run', 'build'], {
  cwd: root,
  stdio: 'inherit',
})
