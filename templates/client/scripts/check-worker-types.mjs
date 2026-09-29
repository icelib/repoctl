import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { generateTypes, loadAndParseConfig } from '@cloudflare/config'
import { generateRuntimeTypes, RUNTIME_TYPES_MARKER } from '@cloudflare/runtime-types'

// Keep these API versions aligned with cf. Unlike cf workers types, this check
// never writes declarations or reuses their runtime body as a trusted cache.
const root = path.resolve(import.meta.dirname, '..')
const output = path.join(root, '.cloudflare/types/index.d.ts')
const loaded = await loadAndParseConfig(path.join(root, 'cloudflare.config.ts'), {
  isPreview: false,
  mode: undefined,
})
if (!loaded.result.success) {
  throw new Error(`Invalid Cloudflare configuration: ${loaded.result.error.message}`)
}
const worker = loaded.result.data.worker
if (!worker) {
  throw new Error('Cloudflare configuration must define a Worker')
}
const declaration = generateTypes({ configPath: '../../cloudflare.config.ts', packageName: 'cf/config' })
const { runtimeHeader, runtimeTypes } = await generateRuntimeTypes({
  compatibilityDate: worker.compatibilityDate,
  compatibilityFlags: worker.compatibilityFlags ?? [],
})
const expected = `${declaration}\n${runtimeHeader}\n${RUNTIME_TYPES_MARKER}\n${runtimeTypes}`
let actual
try {
  actual = await readFile(output, 'utf8')
}
catch (error) {
  if (error.code !== 'ENOENT') {
    throw error
  }
}
if (actual !== expected) {
  console.error('Worker types are missing or outdated. Run pnpm cf-typegen.')
  process.exitCode = 1
}
else {
  console.log('Worker types are up to date.')
}
