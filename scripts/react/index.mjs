import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { createWorkspace, json, registry, run, writeJson } from '../packaged-template/workspace.mjs'
import { checkPreview } from './browser.mjs'

const tempRoot = mkdtempSync(path.join(tmpdir(), 'repoctl-packaged-react-'))
console.log(`React regression workspace: ${tempRoot}`)
try {
  const workspace = createWorkspace(tempRoot, ['react-vite', 'tsdown'])
  const app = path.join(workspace, 'apps/react-vite')
  const library = json(path.join(workspace, 'packages/tsdown/package.json'))
  const appFile = path.join(app, 'package.json')
  const manifest = json(appFile)
  assert.equal(manifest.name, '@icebreakers/react-vite-template')
  assert.equal(json(path.join(workspace, 'package.json')).scripts['test:packaged-react'], undefined)
  const workflow = readFileSync(path.join(workspace, '.github/workflows/ci.yml'), 'utf8')
  for (const sourceCheck of ['test:packaged-react', 'check:no-tracked-build-artifacts', 'check:workflows']) {
    assert.ok(!workflow.includes(`pnpm ${sourceCheck}`), `generated CI must not invoke source check ${sourceCheck}`)
  }
  for (const file of ['dist', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) {
    assert.ok(!existsSync(path.join(app, file)), `template must not ship ${file}`)
  }
  manifest.dependencies[library.name] = 'workspace:*'
  manifest.dependencies = Object.fromEntries(Object.entries(manifest.dependencies).sort(([left], [right]) => left.localeCompare(right)))
  writeJson(appFile, manifest)
  const component = path.join(app, 'src/app.tsx')
  writeFileSync(component, `import { greet } from '${library.name}'\n${readFileSync(component, 'utf8')}`.replace('<main>', `<main>\n      <p>{greet('workspace')}</p>`))

  const newArgs = ['exec', 'repoctl', 'new', 'second-app', '--template', 'react-vite']
  run('pnpm', [...newArgs, '--json', '--out', 'react-plan.json'], workspace)
  const preview = json(path.join(workspace, 'react-plan.json'))
  assert.equal(preview.template, 'react-vite')
  assert.equal(preview.targetName, 'apps/second-app')
  assert.equal(existsSync(path.join(workspace, 'apps/second-app')), false)
  run('pnpm', newArgs, workspace)
  const secondManifest = path.join(workspace, 'apps/second-app/package.json')
  assert.equal(json(secondManifest).name, 'second-app')
  const original = readFileSync(secondManifest, 'utf8')
  assert.throws(() => run('pnpm', newArgs, workspace), /already exists|已存在/u)
  assert.equal(readFileSync(secondManifest, 'utf8'), original)
  run('pnpm', ['exec', 'repoctl', 'templates', '--json', '--out', 'react-templates.json'], workspace)
  const listed = json(path.join(workspace, 'react-templates.json'))
  assert.ok(JSON.stringify(listed).includes('react-vite'))
  run('pnpm', ['exec', 'repoctl', 'templates', 'react-vite', '--json', '--out', 'react-detail.json'], workspace)
  const detail = json(path.join(workspace, 'react-detail.json'))
  assert.ok(JSON.stringify(detail).includes('apps/react-vite'))
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
  const htmlFile = path.join(app, 'index.html')
  const originalHtml = readFileSync(htmlFile, 'utf8')
  const buildHash = () => JSON.parse(run('pnpm', ['exec', 'turbo', 'run', 'build', `--filter=${manifest.name}`, '--dry=json'], workspace))
    .tasks
    .find(task => task.package === manifest.name)
    .hash
  const originalHash = buildHash()
  try {
    writeFileSync(htmlFile, `${originalHtml}\n<!-- cache regression -->\n`)
    assert.notEqual(buildHash(), originalHash, 'HTML entry changes must invalidate the build cache')
  }
  finally {
    writeFileSync(htmlFile, originalHtml)
  }
  await checkPreview(app, process.env.REACT_SMOKE_SCREENSHOT)
  console.log('Packaged React regression passed: both creation flows, protected existing paths and public workspace library consumption.')
}
finally {
  if (process.env.REACT_SMOKE_KEEP === '1') {
    console.log(`Retained React regression workspace: ${tempRoot}`)
  }
  else {
    rmSync(tempRoot, { recursive: true, force: true })
  }
}
