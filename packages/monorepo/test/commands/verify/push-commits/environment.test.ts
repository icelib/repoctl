import type { execFileSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPushEnvironment, pushCommandEnvironment } from '@/commands/verify/pre-push/environment'

afterEach(() => vi.unstubAllEnvs())

describe('pre-push command environment', () => {
  it('removes checkout pointers and inherited package binaries without changing the parent environment', () => {
    const root = path.resolve('fixture-checkout')
    const systemBin = path.resolve('system-bin')
    const inheritedPath = [path.join(root, 'tools'), path.join(root, 'node_modules/.bin'), systemBin].join(path.delimiter)
    vi.stubEnv('PATH', inheritedPath)
    vi.stubEnv('GIT_DIR', path.join(root, '.git'))
    vi.stubEnv('GIT_INDEX_FILE', path.join(root, 'alternate-index'))
    vi.stubEnv('NPM_CONFIG_WORKSPACE_DIR', root)
    vi.stubEnv('npm_config_workspace_dir', root)
    vi.stubEnv('npm_package_json', path.join(root, 'package.json'))
    vi.stubEnv('NODE_PATH', path.join(root, 'node_modules'))
    const git = vi.fn(() => 'GIT_DIR\nGIT_INDEX_FILE\n') as unknown as typeof execFileSync

    const environment = createPushEnvironment(root, git)

    expect(environment['PATH']).toBe(systemBin)
    for (const name of ['GIT_DIR', 'GIT_INDEX_FILE', 'NPM_CONFIG_WORKSPACE_DIR', 'npm_config_workspace_dir', 'npm_package_json', 'NODE_PATH']) {
      expect(environment[name]).toBeUndefined()
    }
    expect(process.env['PATH']).toBe(inheritedPath)
    expect(process.env['GIT_DIR']).toBe(path.join(root, '.git'))
    expect(process.env['NPM_CONFIG_WORKSPACE_DIR']).toBe(root)
  })

  it('sets lifecycle pointers for the snapshot without mutating the reusable environment', () => {
    const environment = { HUSKY: '1', INIT_CWD: 'original', PWD: 'original', custom: 'kept' }
    expect(pushCommandEnvironment(environment, '/snapshot')).toEqual({
      GIT_NO_REPLACE_OBJECTS: '1',
      HUSKY: '0',
      INIT_CWD: '/snapshot',
      PWD: '/snapshot',
      custom: 'kept',
    })
    expect(environment).toEqual({ HUSKY: '1', INIT_CWD: 'original', PWD: 'original', custom: 'kept' })
  })
})
