import assert from 'node:assert/strict'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { json, registry, run, writeJson } from '../packaged-template/workspace.mjs'
import { checkConsumerBrowser } from './browser.mjs'
import { checkNextConsumer } from './next-consumer.mjs'

export async function checkTarballConsumer(tempRoot, library) {
  const packDir = path.join(tempRoot, 'library-packs')
  mkdirSync(packDir)
  const manifest = json(path.join(library, 'package.json'))
  manifest.name = '@repoctl-smoke/react-components'
  manifest.version = '1.0.0'
  delete manifest.private
  writeJson(path.join(library, 'package.json'), manifest)
  run('pnpm', ['pack', '--pack-destination', packDir], library)
  const archives = readdirSync(packDir).filter(file => file.endsWith('.tgz'))
  assert.equal(archives.length, 1)
  const archive = path.join(packDir, archives[0])
  const files = run('tar', ['-tzf', archive], tempRoot).trim().split(/\r?\n/u)
  assert.ok(files.every(file => /^package\/(?:dist\/|README\.md$|LICENSE$|package\.json$)/u.test(file)), `unexpected tarball files: ${files.join(', ')}`)
  assert.ok(files.includes('package/dist/style.css'))
  const bundle = readFileSync(path.join(library, 'dist/index.js'), 'utf8')
  assert.match(bundle, /^['"]use client['"]/u)
  assert.match(bundle, /from\s*["']react["']/u)
  assert.match(bundle, /from\s*["']react\/jsx-runtime["']/u)
  assert.doesNotMatch(bundle, /__CLIENT_INTERNALS_DO_NOT_USE|react\.production|react\.development/u)
  assert.ok(!Object.keys(manifest.dependencies ?? {}).some(name => ['react', 'react-dom'].includes(name)))
  assert.deepEqual(manifest.sideEffects, ['**/*.css'])

  const consumer = path.join(tempRoot, 'consumer')
  mkdirSync(consumer)
  writeJson(path.join(consumer, 'package.json'), {
    name: 'isolated-react-library-consumer',
    private: true,
    type: 'module',
    packageManager: json(path.join(library, '../../package.json')).packageManager,
    dependencies: { [manifest.name]: `file:${archive}`, 'react': '19.3.0', 'react-dom': '19.3.0' },
    devDependencies: { '@types/react': '^19.3.0', '@types/react-dom': '^19.3.0', 'typescript': '~6.0.3', 'vite': '^8.3.2' },
  })
  writeFileSync(path.join(consumer, 'pnpm-workspace.yaml'), 'packages: []\n')
  writeFileSync(path.join(consumer, 'index.html'), '<!doctype html><html><head><title>React library consumer</title></head><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>\n')
  writeFileSync(path.join(consumer, 'main.tsx'), `import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { CounterProps } from '${manifest.name}'
import { Counter } from '${manifest.name}'
import '${manifest.name}/style.css'
const props: CounterProps = { label: 'Consumer count', initialCount: 4, step: 3 }
function App() {
  const [last, setLast] = useState(4)
  return <><Counter {...props} onCountChange={setLast} /><output aria-label="Last change">{last}</output></>
}
createRoot(document.getElementById('root')!).render(<App />)
`)
  writeJson(path.join(consumer, 'tsconfig.json'), {
    compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', jsx: 'react-jsx', strict: true, noEmit: true, noUncheckedSideEffectImports: true, types: ['vite/client'], skipLibCheck: false },
    include: ['main.tsx'],
  })
  writeFileSync(path.join(consumer, 'verify.mjs'), `import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { Counter } from '${manifest.name}'
const require = createRequire(import.meta.url)
const libraryRequire = createRequire(import.meta.resolve('${manifest.name}'))
assert.equal(realpathSync(require.resolve('react')), realpathSync(libraryRequire.resolve('react')))
assert.equal(realpathSync(require.resolve('react-dom')), realpathSync(libraryRequire.resolve('react-dom')))
assert.ok(renderToString(createElement(Counter, {initialCount: 8})).includes('>8</output>'))
assert.throws(() => require.resolve('${manifest.name}/src/counter.tsx'), {code: 'ERR_PACKAGE_PATH_NOT_EXPORTED'})
`)
  run('corepack', ['enable'], consumer)
  run('pnpm', ['install', '--ignore-scripts', '--registry', registry], consumer)
  run('pnpm', ['exec', 'vite', 'build'], consumer)
  run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.json'], consumer)
  run(process.execPath, ['verify.mjs'], consumer)
  await checkConsumerBrowser(consumer)
  await checkNextConsumer(tempRoot, archive, manifest, json(path.join(consumer, 'package.json')).packageManager)
}
