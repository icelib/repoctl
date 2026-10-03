import { readFile } from 'node:fs/promises'
import { enterPrerelease, prepareStable, releasePrerelease } from '@icebreakers/monorepo'
import path from 'pathe'
import { expect, it, vi } from 'vitest'
import { lineFixture } from './fixture'

it.each(['stable', 'prerelease'])('rejects afterVersion removal, renaming or hiding of an applied public package on %s', async (kind) => {
  for (const mutation of ['delete', 'rename', 'private']) {
    const h = await lineFixture()
    if (kind === 'prerelease') {
      await enterPrerelease('beta', h.options)
    }
    await h.write('mutate.cjs', `
      const fs = require('node:fs');
      const file = 'packages/a/package.json';
      const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
      ${mutation === 'delete'
        ? 'fs.rmSync(\'packages/a\', { recursive: true });'
        : `manifest.${mutation === 'rename' ? 'name = \'renamed\'' : 'private = true'}; fs.writeFileSync(file, JSON.stringify(manifest));`}
    `)
    const manifest = JSON.parse(await readFile(path.join(h.cwd, 'package.json'), 'utf8'))
    await h.write('package.json', JSON.stringify({ ...manifest, scripts: { mutate: 'node mutate.cjs' } }))
    const options = { ...h.options, config: { ...h.options.config, hooks: { afterVersion: ['mutate'] } } }
    const head = h.git('rev-parse', 'HEAD')
    const publish = vi.fn()
    await expect(kind === 'stable'
      ? prepareStable(options)
      : releasePrerelease({ ...options, branch: 'preview/1.x' }, publish)).rejects.toThrow('Prepared release versions changed')
    expect(publish).not.toHaveBeenCalled()
    expect(h.git('rev-parse', 'HEAD')).toBe(head)
  }
}, 60000)
