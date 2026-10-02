import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import process from 'node:process'

const expectedNode = process.env.REPOCTL_CONTAINER_NODE_VERSION
if (!expectedNode || process.versions.node !== expectedNode) {
  throw new Error(`Expected the reviewed Node ${expectedNode ?? '(missing)'} image; observed ${process.versions.node}. Regenerate the Dev Container preset after changing its Node version.`)
}
if (!existsSync('pnpm-workspace.yaml')) {
  throw new Error('Run the Dev Container setup from the pnpm workspace root.')
}
const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
const manager = /^pnpm@(\d+\.\d+\.\d+)(?:\+sha(?:224|256|384|512)\.[a-f\d]+)?$/u.exec(manifest.packageManager ?? '')
if (!manager) {
  throw new Error('packageManager must pin an exact stable pnpm version, optionally with a Corepack integrity hash.')
}
const env = {
  ...process.env,
  COREPACK_ENABLE_AUTO_PIN: '0',
  COREPACK_ENABLE_PROJECT_SPEC: '1',
  COREPACK_DEFAULT_TO_LATEST: '0',
  COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
}
// A first pnpm invocation can create manager metadata in the lockfile. Decide
// whether dependencies are locked before asking pnpm to activate or inspect itself.
const lockfile = existsSync('pnpm-lock.yaml') ? '--frozen-lockfile' : '--no-frozen-lockfile'
const managerGuards = ['--config.manage-package-manager-versions=false', '--config.pm-on-fail=ignore']
const observed = spawnSync('corepack', ['pnpm', ...managerGuards, '--version'], { env, encoding: 'utf8' })
if (observed.error || observed.status !== 0 || observed.stdout.trim() !== manager[1]) {
  throw new Error(`Corepack must activate pnpm ${manager[1]}. ${observed.error?.message ?? observed.stderr ?? observed.stdout}`)
}
const installed = spawnSync('corepack', ['pnpm', ...managerGuards, 'install', lockfile, '--config.engine-strict=true'], { env, stdio: 'inherit' })
if (installed.error || installed.status !== 0) {
  throw new Error(`Workspace installation failed (${installed.error?.message ?? installed.status}); fix the error before using this container.`)
}
console.log(`Dev Container ready: Node ${process.versions.node}, pnpm ${manager[1]}.`)
