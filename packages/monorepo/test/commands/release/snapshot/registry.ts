import { Worker } from 'node:worker_threads'
import { afterEach } from 'vitest'

const servers: Worker[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => server.terminate()))
})

export async function startSnapshotRegistry(directory: string) {
  const server = new Worker(`
    const { parentPort, workerData } = require('node:worker_threads');
    const fs = require('node:fs');
    const path = require('node:path');
    const names = ['snapshot-a', 'snapshot-b'];
    require('node:http').createServer((req, res) => {
      const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname.slice(1));
      if (name.startsWith('tarballs/')) {
        const filename = path.join(workerData, path.basename(name));
        if (fs.existsSync(filename)) { res.end(fs.readFileSync(filename)); return; }
      }
      res.setHeader('content-type', 'application/json');
      if (!names.includes(name)) {res.writeHead(404); res.end(JSON.stringify({error:'Not found'})); return;}
      const filename = path.join(workerData, name + '.json');
      const published = fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename, 'utf8')) : {};
      const versions = {'1.0.0': {name,version:'1.0.0'}, ...published};
      res.end(JSON.stringify({name,'dist-tags':{latest:'1.0.0'},versions}));
    }).listen(0, '127.0.0.1', function() {parentPort.postMessage(this.address().port)});
  `, { eval: true, workerData: directory })
  servers.push(server)
  const port = await new Promise<number>((resolve, reject) => {
    server.once('message', resolve)
    server.once('error', reject)
  })
  return `http://127.0.0.1:${port}/`
}
