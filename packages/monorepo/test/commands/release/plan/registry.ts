import { Worker } from 'node:worker_threads'
import { afterEach } from 'vitest'

const servers: Worker[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => server.terminate()))
})

/** A worker can answer requests while native pnpm runs through spawnSync. */
export async function startRegistry() {
  const server = new Worker(`
    const { parentPort } = require('node:worker_threads');
    const packages = new Set(['a', 'b', 'consumer', 'private-lib', 'root-pkg']);
    require('node:http').createServer((req, res) => {
      const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname.slice(1));
      res.setHeader('content-type', 'application/json');
      if (!packages.has(name)) {
        res.writeHead(404);
        res.end(JSON.stringify({error: 'Not found'}));
        return;
      }
      res.end(JSON.stringify({name, 'dist-tags': {latest: '1.0.0'}, versions: {'1.0.0': {name, version: '1.0.0'}}}));
    }).listen(0, '127.0.0.1', function () {parentPort.postMessage(this.address().port)});
  `, { eval: true })
  servers.push(server)
  const port = await new Promise<number>((resolve, reject) => {
    server.once('message', resolve)
    server.once('error', reject)
  })
  return `http://127.0.0.1:${port}`
}
