import type { TemplateRemoteSource } from '../../../src/index'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { execa } from 'execa'
import { c, Header } from 'tar'
import { afterEach } from 'vitest'
import { fixture as authorFixture } from '../template-validation/fixtures'

export { cli, exists, json, loadRepo } from '../template-validation/fixtures'

const servers: ReturnType<typeof createServer>[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve) => {
    server.closeAllConnections()
    server.close(() => resolve())
  })))
})

export async function workspace() {
  const author = await authorFixture()
  const cwd = path.join(author.cwd, 'consumer')
  await mkdir(cwd)
  await writeFile(path.join(cwd, 'package.json'), JSON.stringify({ name: 'remote-consumer', private: true }))
  await writeFile(path.join(cwd, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
  const packageDir = path.join(author.cwd, 'package')
  await mkdir(packageDir)
  await cp(author.sourceDir, path.join(packageDir, 'templates/sample'), { recursive: true })
  const scriptMarker = path.join(author.cwd, 'remote-script-executed')
  await writeFile(path.join(packageDir, 'package.json'), JSON.stringify({ name: '@fixtures/templates', version: '1.2.3', scripts: { prepare: `node -e ${JSON.stringify(`require('node:fs').writeFileSync(${JSON.stringify(scriptMarker)}, 'bad')`)}` } }))
  return { ...author, root: author.cwd, cwd, packageDir, scriptMarker, cacheDir: path.join(author.cwd, 'cache') }
}

export async function configure(fixture: Awaited<ReturnType<typeof workspace>>, remote: TemplateRemoteSource, source = 'templates/sample') {
  await writeFile(path.join(fixture.cwd, 'repoctl.config.mjs'), `export default ${JSON.stringify({ commands: { create: { cacheDir: fixture.cacheDir, templateMap: { custom: { source, target: 'packages/custom', category: 'library', description: 'Remote asset', remote } } } } })}`)
}

export async function npmFixture() {
  const fixture = await workspace()
  const archiveFile = path.join(fixture.root, 'package.tgz')
  await c({ file: archiveFile, gzip: true, cwd: fixture.root }, ['package'])
  const state = { bytes: await readFile(archiveFile), integrity: '', version: '1.2.3', requests: 0, auth: [] as string[], rejectAuth: false }
  state.integrity = `sha512-${createHash('sha512').update(state.bytes).digest('base64')}`
  let registry = ''
  const token = 'template-fixture-secret'
  const server = createServer((request, response) => {
    state.requests++
    state.auth.push(request.headers.authorization ?? '')
    if (state.rejectAuth || request.headers.authorization !== `Bearer ${token}`) {
      response.writeHead(401)
      response.end(JSON.stringify({ error: 'authentication required' }))
    }
    else if (request.url?.endsWith('.tgz')) {
      response.writeHead(200, { 'content-type': 'application/octet-stream' })
      response.end(state.bytes)
    }
    else {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ 'name': '@fixtures/templates', 'dist-tags': { latest: '1.2.3' }, 'versions': { '1.2.3': { name: '@fixtures/templates', version: state.version, dist: { tarball: `${registry}archive.tgz`, integrity: state.integrity } } } }))
    }
  })
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Expected a TCP fixture server.')
  }
  registry = `http://127.0.0.1:${address.port}/`
  await writeFile(path.join(fixture.cwd, '.npmrc'), `//127.0.0.1:${address.port}/:_authToken=${token}\n`)
  const remote: TemplateRemoteSource = { kind: 'npm', packageName: '@fixtures/templates', version: '1.2.3', registry }
  await configure(fixture, remote)
  return { ...fixture, remote, state, token, server }
}

export async function gitFixture() {
  const fixture = await workspace()
  const hooks = path.join(fixture.root, 'empty-hooks')
  await mkdir(hooks)
  const git = (args: string[]) => execa('git', ['-c', `core.hooksPath=${hooks}`, '-C', fixture.packageDir, ...args])
  await git(['init'])
  await git(['config', 'user.name', 'Template Test'])
  await git(['config', 'user.email', 'template@example.test'])
  await git(['add', '.'])
  await git(['commit', '-m', 'fixture'])
  const commit = (await git(['rev-parse', 'HEAD'])).stdout
  const remote: TemplateRemoteSource = { kind: 'git', repository: pathToFileURL(fixture.packageDir).href, ref: commit }
  await configure(fixture, remote)
  return { ...fixture, remote, git, commit }
}

export function unsafeArchive(names: string | string[], link = false) {
  const blocks = (Array.isArray(names) ? names : [names]).map((name) => {
    const header = new Header({ path: name, mode: 0o644, size: 0, type: link ? 'SymbolicLink' : 'File', ...(link ? { linkpath: '../../outside' } : {}) })
    header.encode()
    return header.block!
  })
  return Buffer.concat([...blocks, Buffer.alloc(1024)])
}
