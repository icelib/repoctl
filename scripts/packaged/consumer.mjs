import assert from 'node:assert/strict'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'

const pnpmBuiltins = new Set(['install', 'exec', 'audit', 'change', 'version'])

function assertCommandReferences(command, scripts, directory) {
  for (const match of command.matchAll(/(?:^|&&\s*)pnpm (?:run )?([\w:-]+)/g)) {
    assert.ok(pnpmBuiltins.has(match[1]) || Object.hasOwn(scripts, match[1]), `missing script ${match[1]} in ${command}`)
  }
  for (const match of command.matchAll(/(?:^|&&\s*)node\s+(?!-)(\S+)/g)) {
    assert.ok(existsSync(path.resolve(directory, match[1])), `missing local entry ${match[1]} in ${command}`)
  }
}

export function assertConsumerContract(directory) {
  const manifest = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'))
  const scripts = manifest.scripts
  for (const command of Object.values(scripts)) {
    assertCommandReferences(command, scripts, directory)
    assert.ok(!command.includes('tooling:build'), 'consumer commands must not require the source tooling build')
  }
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const version of Object.values(manifest[field] ?? {})) {
      assert.ok(!/^(?:workspace|catalog):/.test(version), `unresolved source dependency ${version}`)
    }
  }
  const workflow = YAML.parse(readFileSync(path.join(directory, '.github/workflows/ci.yml'), 'utf8'))
  for (const step of workflow.jobs.build.steps) {
    if (step.run) {
      assertCommandReferences(step.run, scripts, directory)
    }
  }
}

export function installConsumer(directory, tarballs, run) {
  const workspacePath = path.join(directory, 'pnpm-workspace.yaml')
  const workspace = YAML.parse(readFileSync(workspacePath, 'utf8'))
  workspace.overrides = {
    ...workspace.overrides,
    ...Object.fromEntries([...tarballs].map(([name, tarball]) => [name, `file:${tarball}`])),
  }
  writeFileSync(workspacePath, YAML.stringify(workspace))
  run('pnpm', ['install', '--ignore-scripts', '--prefer-offline', '--no-frozen-lockfile'], directory)
  for (const task of ['build', 'lint', 'typecheck', 'tsd', 'test']) {
    console.log(`Checking generated workspace ${task}...`)
    run('pnpm', ['run', task], directory)
  }
  for (const bin of ['repo', 'repoctl']) {
    const help = run('pnpm', ['exec', bin, '--help'], directory)
    assert.match(help, /^Usage: (?:repo|repoctl) /m, `${bin} must expose the packaged CLI help`)
  }
  run('pnpm', ['exec', 'node', '--input-type=module', '--eval', [
    'import assert from "node:assert/strict";',
    'import { clearWorkspaceCache, defineMonorepoConfig, resolveCreateNewProjectPlan } from "repoctl";',
    'import { defineVitestConfig, defineEslintConfig } from "repoctl/tooling";',
    'for (const fn of [clearWorkspaceCache, defineMonorepoConfig, resolveCreateNewProjectPlan, defineVitestConfig, defineEslintConfig]) assert.equal(typeof fn, "function");',
    'assert.deepEqual(defineMonorepoConfig({}), {});',
  ].join('\n')], directory)

  const failureTest = path.join(directory, 'packages/tsdown/test/intentional-failure.test.ts')
  writeFileSync(failureTest, 'it("propagates a real failure", () => { throw new Error("CONSUMER_TEST_FAILURE") })\n')
  try {
    assert.throws(
      () => run('pnpm', ['run', 'test'], directory),
      error => String(error.stdout).includes('CONSUMER_TEST_FAILURE') || String(error.stderr).includes('CONSUMER_TEST_FAILURE'),
      'allowing an empty test suite must not swallow real test failures',
    )
  }
  finally {
    rmSync(failureTest)
  }
}
