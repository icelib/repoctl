import { tmpdir } from 'node:os'
import process from 'node:process'
import path from 'pathe'
import { afterEach, beforeEach, vi } from 'vitest'
import fs from '@/utils/fs'

const roots: string[] = []

export async function createTempOutDir(slug: string) {
  const root = await fs.mkdtemp(path.join(tmpdir(), slug))
  roots.push(root)
  const outDir = path.join(root, 'workspace')
  await fs.ensureDir(outDir)
  return { root, outDir }
}

export function setInteractiveTTY() {
  for (const stream of [process.stdin, process.stdout]) {
    Object.defineProperty(stream, 'isTTY', { configurable: true, value: true })
  }
}

export function registerUpgradeFixtureCleanup() {
  let descriptors: Array<PropertyDescriptor | undefined> = []
  beforeEach(() => {
    descriptors = [process.stdin, process.stdout].map(stream => Object.getOwnPropertyDescriptor(stream, 'isTTY'))
  })
  afterEach(async () => {
    for (const [index, stream] of [process.stdin, process.stdout].entries()) {
      const descriptor = descriptors[index]
      if (descriptor) {
        Object.defineProperty(stream, 'isTTY', descriptor)
      }
      else {
        Reflect.deleteProperty(stream, 'isTTY')
      }
    }
    vi.doUnmock('@icebreakers/monorepo-templates')
    vi.doUnmock('@/core/git')
    vi.resetAllMocks()
    vi.resetModules()
    await Promise.all(roots.splice(0).map(root => fs.remove(root)))
  })
}
