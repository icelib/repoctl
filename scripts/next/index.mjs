import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { createWorkspace, json, registry, run, writeJson } from '../packaged-template/workspace.mjs'
import { checkProductionApp } from './browser.mjs'

const tempRoot = mkdtempSync(path.join(tmpdir(), 'repoctl-packaged-next-'))
console.log(`Next regression workspace: ${tempRoot}`)
try {
  const workspace = createWorkspace(tempRoot, ['next', 'tsdown'])
  const app = path.join(workspace, 'apps/next')
  const library = json(path.join(workspace, 'packages/tsdown/package.json'))
  const appFile = path.join(app, 'package.json')
  const manifest = json(appFile)
  assert.equal(manifest.name, '@icebreakers/next-template')
  assert.equal(json(path.join(workspace, 'package.json')).scripts['test:packaged-next'], undefined)
  const workflow = readFileSync(path.join(workspace, '.github/workflows/ci.yml'), 'utf8')
  for (const sourceCheck of ['test:packaged-next', 'test:packaged-react', 'check:no-tracked-build-artifacts', 'check:workflows']) {
    assert.ok(!workflow.includes(`pnpm ${sourceCheck}`), `generated CI must not invoke source check ${sourceCheck}`)
  }
  for (const file of ['.next', 'next-env.d.ts', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) {
    assert.ok(!existsSync(path.join(app, file)), `template must not ship ${file}`)
  }
  const source = path.join(workspace, 'packages/source-shared')
  mkdirSync(path.join(source, 'src'), { recursive: true })
  writeJson(path.join(source, 'package.json'), { name: '@fixture/source-shared', type: 'module', version: '1.0.0', private: true, exports: './src/index.ts', scripts: { lint: 'eslint .', typecheck: 'tsc --noEmit' } })
  writeJson(path.join(source, 'tsconfig.json'), { extends: '../../tsconfig.json', include: ['src'] })
  writeFileSync(path.join(source, 'src/index.ts'), `export function sourceGreeting(name: string) {\n  return \`source \${name}\`\n}\n`)
  manifest.dependencies[library.name] = 'workspace:*'
  manifest.dependencies['@fixture/source-shared'] = 'workspace:*'
  manifest.dependencies = Object.fromEntries(Object.entries(manifest.dependencies).sort(([left], [right]) => left.localeCompare(right)))
  writeJson(appFile, manifest)
  const page = path.join(app, 'src/app/page.tsx')
  writeFileSync(page, `import { sourceGreeting } from '@fixture/source-shared'\nimport { greet } from '${library.name}'\n${readFileSync(page, 'utf8')}`.replace('<main>', `<main>\n      <p>{greet('workspace')}</p>\n      <p>{sourceGreeting('workspace')}</p>`))
  const config = path.join(app, 'next.config.ts')
  writeFileSync(config, readFileSync(config, 'utf8').replace('= {}', '= { transpilePackages: [\'@fixture/source-shared\'] }'))

  const newArgs = ['exec', 'repoctl', 'new', 'second-next', '--template', 'next']
  run('pnpm', [...newArgs, '--json', '--out', 'next-plan.json'], workspace)
  const preview = json(path.join(workspace, 'next-plan.json'))
  assert.equal(preview.template, 'next')
  assert.equal(preview.targetName, 'apps/second-next')
  assert.equal(existsSync(path.join(workspace, 'apps/second-next')), false)
  run('pnpm', newArgs, workspace)
  const secondManifest = path.join(workspace, 'apps/second-next/package.json')
  assert.equal(json(secondManifest).name, 'second-next')
  const original = readFileSync(secondManifest, 'utf8')
  assert.throws(() => run('pnpm', newArgs, workspace), /already exists|已存在/u)
  assert.equal(readFileSync(secondManifest, 'utf8'), original)
  run('pnpm', ['exec', 'repoctl', 'templates', '--json', '--out', 'next-templates.json'], workspace)
  assert.ok(JSON.stringify(json(path.join(workspace, 'next-templates.json'))).includes('next'))
  run('pnpm', ['exec', 'repoctl', 'templates', 'next', '--json', '--out', 'next-detail.json'], workspace)
  assert.ok(JSON.stringify(json(path.join(workspace, 'next-detail.json'))).includes('apps/next'))
  run('pnpm', ['exec', 'repoctl', 'templates', '--check', '--json'], workspace)
  run('pnpm', ['install', '--ignore-scripts', '--no-frozen-lockfile', '--registry', registry], workspace)
  console.log('Checking generated build, ESLint/Stylelint, TypeScript and Vitest…')
  for (const command of ['build', 'lint', 'typecheck', 'tsd', 'test']) {
    run('pnpm', [command], workspace)
  }
  const installedLibrary = path.join(app, 'node_modules', library.name)
  assert.ok(existsSync(path.join(installedLibrary, 'dist/index.mjs')))
  assert.ok(existsSync(path.join(installedLibrary, 'dist/index.d.mts')))
  assert.equal(realpathSync(installedLibrary), realpathSync(path.join(workspace, 'packages/tsdown')))
  const originalPage = readFileSync(page, 'utf8')
  const task = () => JSON.parse(run('pnpm', ['exec', 'turbo', 'run', 'build', `--filter=${manifest.name}`, '--dry=json'], workspace)).tasks.find(task => task.package === manifest.name)
  const buildTask = task()
  assert.ok(buildTask.outputs.includes('.next/**'))
  assert.ok(buildTask.excludedOutputs.includes('.next/cache/**'))
  try {
    writeFileSync(page, `${originalPage}\n// cache regression\n`)
    assert.notEqual(task().hash, buildTask.hash, 'App Router source changes must invalidate build cache')
  }
  finally {
    writeFileSync(page, originalPage)
  }
  const buildId = readFileSync(path.join(app, '.next/BUILD_ID'), 'utf8')
  rmSync(path.join(app, '.next'), { recursive: true, force: true })
  run('pnpm', ['exec', 'turbo', 'run', 'build', `--filter=${manifest.name}`], workspace)
  assert.equal(readFileSync(path.join(app, '.next/BUILD_ID'), 'utf8'), buildId, 'Turbo must restore the same production build from cache')
  await checkProductionApp(app, process.env.NEXT_SMOKE_SCREENSHOT)
  console.log('Packaged Next regression passed: both creation flows, safe existing paths and built/source workspace library consumption.')
}
finally {
  if (process.env.NEXT_SMOKE_KEEP === '1') {
    console.log(`Retained Next regression workspace: ${tempRoot}`)
  }
  else {
    rmSync(tempRoot, { recursive: true, force: true })
  }
}
