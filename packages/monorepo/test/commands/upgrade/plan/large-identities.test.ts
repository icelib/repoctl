import { lstat, readFile } from 'node:fs/promises'
import { planUpgrade } from '@icebreakers/monorepo'
import path from 'pathe'
import { expect, it } from 'vitest'
import { fixture } from './fixture'
import { instrument, transactionId } from './instrument'

function identities(field: 'dev' | 'ino', tracked: string) {
  return `
    let replaced = false
    const tracked = filename => ${tracked}
    const identify = (stat, options) => {
      const value = replaced ? 9007199254740993n : 9007199254740992n
      Object.defineProperty(stat, '${field}', { value: options?.bigint ? value : Number(value) })
      return stat
    }
    const lstat = fs.lstat
    fs.lstat = async (filename, options) => {
      const stat = await lstat(filename, options)
      return tracked(filename) ? identify(stat, options) : stat
    }
    const originalOpen = fs.open
    fs.open = async (filename, ...args) => {
      const handle = await originalOpen(filename, ...args)
      if (tracked(filename)) {
        const stat = handle.stat.bind(handle)
        handle.stat = async options => identify(await stat(options), options)
      }
      return handle
    }
  `
}

it.each(['dev', 'ino'] as const)('keeps a replacement directory whose large %s rounds to the same Number', async (field) => {
  const h = await fixture()
  const plan = await planUpgrade({ cwd: h.cwd, targets: ['.editorconfig'] })
  const baseline = plan.files[0]!.baseline!.path
  const directory = path.dirname(path.join(h.cwd, baseline))
  const output = await instrument(plan, `
    ${identities(field, `path.resolve(filename) === ${JSON.stringify(directory)}`)}
    const open = fs.open
    fs.open = async (filename, ...args) => {
      if (path.resolve(filename) === path.resolve(root, ${JSON.stringify(`${baseline}.repoctl-upgrade-${transactionId}.tmp`)})) {
        await fs.rename(path.dirname(filename), path.dirname(filename) + '.retained')
        await fs.mkdir(path.dirname(filename))
        replaced = true
        throw new Error('Injected large directory replacement')
      }
      return open(filename, ...args)
    }
  `)
  expect(output).toContain('Injected large directory replacement')
  expect((await lstat(directory)).isDirectory()).toBe(true)
  expect((await lstat(`${directory}.retained`)).isDirectory()).toBe(true)
  await expect(readFile(path.join(h.cwd, '.editorconfig'))).rejects.toThrow()
})

it.each(['dev', 'ino'] as const)('retains a same-byte replacement backup whose large %s rounds to the owned identity', async (field) => {
  const h = await fixture()
  await h.write('.editorconfig', 'original asset\n')
  const plan = await planUpgrade({ cwd: h.cwd, targets: ['.editorconfig'], overwrite: true })
  const backup = `.editorconfig.repoctl-upgrade-${transactionId}.bak`
  const output = await instrument(plan, `
    ${identities(field, `path.resolve(filename) === path.resolve(root, ${JSON.stringify(backup)})`)}
    const rename = fs.rename
    fs.rename = async (source, target) => {
      await rename(source, target)
      if (source.endsWith('.tmp') && target.endsWith('.editorconfig')) {
        const backup = path.resolve(root, ${JSON.stringify(backup)})
        await rename(backup, backup + '.retained')
        await fs.copyFile(backup + '.retained', backup)
        replaced = true
      }
    }
  `)
  expect(output).toContain('remove retained backups after review')
  expect(await readFile(path.join(h.cwd, backup), 'utf8')).toBe('original asset\n')
  expect(await readFile(path.join(h.cwd, `${backup}.retained`), 'utf8')).toBe('original asset\n')
})

it.each(['dev', 'ino'] as const)('does not restore over a same-byte concurrent output with a distinct large %s', async (field) => {
  const h = await fixture()
  await h.write('.editorconfig', 'original editor\n')
  await h.write('Dockerfile', 'original docker\n')
  const plan = await planUpgrade({ cwd: h.cwd, targets: ['.editorconfig', 'Dockerfile'], overwrite: true })
  const output = await instrument(plan, `
    ${identities(field, `path.resolve(filename) === path.resolve(root, '.editorconfig') || path.resolve(filename) === path.resolve(root, '.editorconfig.repoctl-upgrade-${transactionId}.tmp')`)}
    const rename = fs.rename
    fs.rename = async (source, target) => {
      await rename(source, target)
      if (source.endsWith('.tmp') && target.endsWith('Dockerfile')) {
        const editor = path.join(root, '.editorconfig')
        await rename(editor, editor + '.retained')
        await fs.copyFile(editor + '.retained', editor)
        replaced = true
      }
    }
  `)
  expect(output).toContain('recover original files')
  expect(await readFile(path.join(h.cwd, '.editorconfig'), 'utf8')).toBe(await readFile(path.join(h.cwd, '.editorconfig.retained'), 'utf8'))
  expect(await readFile(path.join(h.cwd, `.editorconfig.repoctl-upgrade-${transactionId}.bak`), 'utf8')).toBe('original editor\n')
  expect(await readFile(path.join(h.cwd, 'Dockerfile'), 'utf8')).toBe('original docker\n')
})
