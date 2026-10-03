import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { containerHarness } from './container.mjs'
import { prepareWorkspace } from './workspace.mjs'

const tempRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'repoctl-packaged-devcontainer-')))
console.log(`Dev Container regression workspace: ${tempRoot}`)
let harness
try {
  const { workspace, plan, rootManifest } = prepareWorkspace(tempRoot)
  harness = containerHarness(workspace, path.join(tempRoot, 'packs'))
  const container = harness.start()
  const sourceMount = container.Mounts.find(mount => mount.Source === workspace)
  assert.ok(sourceMount, 'the generated workspace must be mounted as source')
  const store = container.Mounts.find(mount => mount.Destination === '/home/node/.local/share/pnpm/store')
  assert.equal(store?.Type, 'volume')
  assert.ok(!store.Destination.startsWith(sourceMount.Destination))
  const runtime = JSON.parse(harness.exec(['node', '-e', 'console.log(JSON.stringify({node:process.versions.node,arch:process.arch,uid:process.getuid(),cwd:process.cwd()}))']).trim())
  assert.equal(runtime.node, plan.nodeVersion)
  assert.notEqual(runtime.uid, 0)
  const expectedArch = process.env.DEVCONTAINER_SMOKE_ARCH ?? ({ arm64: 'arm64', x64: 'x64' })[process.arch]
  assert.equal(runtime.arch, expectedArch)
  assert.equal(harness.exec(['pnpm', '--version']).trim(), rootManifest.packageManager.slice(5).split('+')[0])
  assert.match(harness.exec(['pnpm', 'store', 'path']).trim(), /^\/home\/node\/\.local\/share\/pnpm\/store\//u)
  harness.exec(['node', '-e', 'require("node:fs").writeFileSync(".container-permissions", "non-root write")'])
  assert.equal(readFileSync(path.join(workspace, '.container-permissions'), 'utf8'), 'non-root write')

  // Repeat setup with the lockfile created by the first lifecycle run.
  harness.exec(['node', '.devcontainer/setup.mjs'])
  for (const command of ['build', 'lint', 'typecheck', 'tsd', 'test']) {
    console.log(`Checking generated ${command} inside ${runtime.arch} Dev Container…`)
    harness.exec(['pnpm', command])
  }
  harness.exec(['pnpm', 'exec', 'repo', 'doctor'])

  const manifestPath = path.join(workspace, 'package.json')
  const manifestBefore = readFileSync(manifestPath, 'utf8')
  try {
    const manifest = JSON.parse(manifestBefore)
    manifest.devDependencies['repoctl-devcontainer-missing-fixture'] = '1.0.0'
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    assert.match(harness.expectFailure(['node', '.devcontainer/setup.mjs']), /Workspace installation failed/u)
  }
  finally {
    writeFileSync(manifestPath, manifestBefore)
  }
  assert.match(harness.expectFailure(['env', 'REPOCTL_CONTAINER_NODE_VERSION=0.0.0', 'node', '.devcontainer/setup.mjs']), /Expected the reviewed Node/u)
  console.log(`Packaged Dev Container passed on Linux ${runtime.arch}: pinned runtime, non-root access, isolated store, lifecycle failure propagation and generated workspace checks.`)
}
finally {
  try {
    harness?.cleanup()
  }
  finally {
    if (process.env.DEVCONTAINER_SMOKE_KEEP === '1') {
      console.log(`Retained Dev Container regression files: ${tempRoot}`)
    }
    else {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  }
}
