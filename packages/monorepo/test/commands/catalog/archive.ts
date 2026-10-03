import { Buffer } from 'node:buffer'
import { gzipSync } from 'node:zlib'

/** Minimal deterministic npm tarball; installation tests need no separate pack process. */
export function packageArchive(name: string) {
  const files = {
    'package/package.json': JSON.stringify({ name, version: '1.1.0', main: 'index.cjs' }),
    'package/index.cjs': 'module.exports = 42\n',
  }
  const blocks: Buffer[] = []
  for (const [filename, content] of Object.entries(files)) {
    const body = Buffer.from(content)
    const header = Buffer.alloc(512)
    const octal = (value: number, offset: number, length: number) => header.write(`${value.toString(8).padStart(length - 1, '0')}\0`, offset, length, 'ascii')
    header.write(filename)
    octal(0o644, 100, 8)
    octal(0, 108, 8)
    octal(0, 116, 8)
    octal(body.length, 124, 12)
    octal(0, 136, 12)
    header.fill(32, 148, 156)
    header.write('0', 156)
    header.write('ustar\0', 257)
    header.write('00', 263)
    header.write(`${header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii')
    blocks.push(header, body, Buffer.alloc((512 - body.length % 512) % 512))
  }
  return gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]))
}
