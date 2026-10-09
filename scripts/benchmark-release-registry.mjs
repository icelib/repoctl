import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const specs = process.argv.slice(2).filter(arg => !arg.startsWith('--'))
const rounds = Number(process.argv.find(arg => arg.startsWith('--rounds='))?.split('=')[1] ?? 3)
assert.ok(specs.length && Number.isInteger(rounds) && rounds > 0, 'Usage: node scripts/benchmark-release-registry.mjs name@version ... [--rounds=3]')
const packages = specs.map((spec) => {
  const split = spec.lastIndexOf('@')
  assert.ok(split > 0 && split < spec.length - 1, `Exact version required: ${spec}`)
  return { name: spec.slice(0, split), version: spec.slice(split + 1) }
})

async function http(pkg) {
  const name = encodeURIComponent(pkg.name)
  const version = await fetch(`https://registry.npmjs.org/${name}/${encodeURIComponent(pkg.version)}`, { signal: AbortSignal.timeout(10_000), headers: { 'cache-control': 'no-cache' } })
  assert.equal(version.status, 200)
  assert.equal((await version.json()).version, pkg.version)
  const tags = await fetch(`https://registry.npmjs.org/-/package/${name}/dist-tags`, { signal: AbortSignal.timeout(10_000), headers: { 'cache-control': 'no-cache' } })
  assert.equal(tags.status, 200)
  assert.equal((await tags.json()).latest, pkg.version)
}

async function parallel() {
  let next = 0
  await Promise.all(Array.from({ length: Math.min(4, packages.length) }, async () => {
    while (next < packages.length) {
      await http(packages[next++])
    }
  }))
}

async function serial() {
  for (const spec of specs) {
    const { stdout } = await exec('npm', ['view', spec, '--json', '--registry=https://registry.npmjs.org'], { timeout: 10_000, maxBuffer: 4 * 1024 * 1024 })
    const data = JSON.parse(stdout)
    assert.equal(`${data.name}@${data.version}`, spec)
    assert.equal(data['dist-tags'].latest, data.version)
  }
}

const samples = { serialNpmMs: [], parallelHttpMs: [] }
for (let round = 0; round <= rounds; round++) {
  for (const [key, run] of [['serialNpmMs', serial], ['parallelHttpMs', parallel]]) {
    const start = performance.now()
    await run()
    if (round > 0) {
      samples[key].push(Math.round(performance.now() - start))
    }
  }
}
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), node: process.version, concurrency: 4, requestTimeoutMs: 10_000, packages: specs, warmupRounds: 1, rounds, ...samples, propagationWaitMs: 0, note: 'Read-only queries of already-visible versions and latest tags; measures query overhead, not npm propagation.' }, null, 2))
