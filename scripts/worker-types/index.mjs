import assert from 'node:assert/strict'
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { checkCacheInputs, checkCacheRestore } from './cache.mjs'
import { checkCloudflareWorkflows } from './cloudflare.mjs'
import { createTempRoot, createWorkspace, declarations, repoRoot, run } from './workspace.mjs'

function checkReadOnly(cwd, success) {
  const file = path.join(cwd, declarations)
  const before = existsSync(file) ? { content: readFileSync(file, 'utf8'), mtime: statSync(file).mtimeMs } : undefined
  const result = run('pnpm', ['cf-typegen:check'], cwd, success)
  if (before) {
    assert.equal(readFileSync(file, 'utf8'), before.content, 'check must not rewrite declarations')
    assert.equal(statSync(file).mtimeMs, before.mtime, 'check must preserve modification time')
  }
  else {
    assert.ok(!existsSync(file), 'check must not generate missing declarations')
  }
  return result
}

const tempRoot = createTempRoot()
try {
  const workspace = await createWorkspace(tempRoot, true)
  console.log('Checking generated types from the packed client and server templates...')
  for (const name of ['client', 'server']) {
    const cwd = path.join(workspace, 'apps', name)
    const file = path.join(cwd, declarations)
    assert.ok(!existsSync(file), 'new projects must not contain stale declarations')
    checkReadOnly(cwd, false)
    for (const task of ['build', 'typecheck']) {
      rmSync(file, { force: true })
      run('pnpm', ['run', task], cwd)
      assert.ok(existsSync(file), `${name} ${task} must generate missing declarations`)
      checkReadOnly(cwd, true)
    }
  }
  console.log('Checking cold builds, cache restoration, and cache invalidation...')
  for (const task of ['build', 'typecheck']) {
    for (const name of ['client', 'server']) {
      rmSync(path.join(workspace, 'apps', name, declarations), { force: true })
    }
    checkCacheRestore(workspace, task)
  }
  checkCacheInputs(workspace)

  console.log('Checking configuration updates and real type errors...')
  const server = path.join(workspace, 'apps/server')
  const configPath = path.join(server, 'cloudflare.config.ts')
  const config = readFileSync(configPath, 'utf8')
  const updated = config.replace('2025-10-16', '2025-10-17')
  assert.notEqual(updated, config)
  writeFileSync(configPath, updated)
  checkReadOnly(server, false)
  run('pnpm', ['typecheck'], server)
  const declarationPath = path.join(server, declarations)
  const generated = readFileSync(declarationPath, 'utf8')
  assert.match(generated, /2025-10-17/)
  checkReadOnly(server, true)

  // Binding types now reference the live configuration instead of embedding
  // binding names. Prove that changing config updates inference immediately.
  const boundConfig = updated.replace('defineConfig }', 'bindings, defineConfig }')
    .replace('worker: {', 'worker: { env: { TYPEGEN_TEST: bindings.text(\'updated\') },')
  assert.notEqual(boundConfig, updated)
  writeFileSync(configPath, boundConfig)
  const probe = path.join(server, 'src/typegen-probe.ts')
  writeFileSync(probe, 'export const value: Env[\'TYPEGEN_TEST\'] = \'updated\'\n')
  checkReadOnly(server, true)
  // The Node compilation intentionally has no Worker globals.
  run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.worker.json'], server)
  writeFileSync(probe, 'export const value: Env[\'TYPEGEN_TEST\'] = 123\n')
  assert.match(run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.worker.json'], server, false), /TS2322/)
  rmSync(probe)

  // A correct runtime header must not hide a corrupted cached declaration.
  writeFileSync(declarationPath, `${generated}\n// corrupted declaration\n`)
  checkReadOnly(server, false)
  rmSync(declarationPath)
  run('pnpm', ['cf-typegen'], server)
  checkReadOnly(server, true)
  writeFileSync(path.join(server, 'src/typegen-error.ts'), 'export const invalid: string = 123\n')
  assert.match(run('pnpm', ['typecheck'], server, false), /TS2322/)
  rmSync(path.join(server, 'src/typegen-error.ts'))
  writeFileSync(configPath, 'export default { worker: { compatibilityDate: 42 } }\n')
  checkReadOnly(server, false)
  run('pnpm', ['build'], server, false)
  writeFileSync(configPath, config)
  run('pnpm', ['typecheck'], server)

  await checkCloudflareWorkflows(workspace)

  assert.equal(run('git', ['diff', '--name-only'], workspace).trim(), '', 'generated output must leave tracked files unchanged')
  assert.equal(run('git', ['ls-files', '--others', '--exclude-standard'], workspace).trim(), '', 'generated files must be ignored')
  run(process.execPath, [path.join(repoRoot, 'scripts/check-no-tracked-build-artifacts.mjs')], workspace)
  run('git', ['add', '--force', `apps/server/${declarations}`], workspace)
  run(process.execPath, [path.join(repoRoot, 'scripts/check-no-tracked-build-artifacts.mjs')], workspace, false)
  console.log('Worker type generation regression checks passed.')
}
finally {
  rmSync(tempRoot, { recursive: true, force: true })
}
