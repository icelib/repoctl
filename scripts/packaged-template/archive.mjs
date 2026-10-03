import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

/** Archive adversarial fixture bytes without invoking package lifecycle scripts. */
export function archiveFixturePackage(source, archive, files) {
  const expected = new Map(files.map(filename => [filename, readFileSync(path.join(source, filename))]))
  const git = args => execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'core.fsmonitor=false', '-c', `core.attributesFile=${path.join(source, '.git/no-fixture-attributes')}`, ...args], { cwd: source, stdio: ['ignore', 'pipe', 'pipe'] })
  git(['init', '-q'])
  git(['add', '--all'])
  const tree = git(['write-tree']).toString('utf8').trim()
  writeFileSync(archive, gzipSync(git(['archive', '--format=tar', '--prefix=package/', tree])))
  for (const [filename, bytes] of expected) {
    assert.deepEqual(execFileSync('tar', ['-xOf', archive, `package/${filename}`]), bytes, `Fixture archive must retain exact ${filename} bytes`)
  }
  return archive
}
