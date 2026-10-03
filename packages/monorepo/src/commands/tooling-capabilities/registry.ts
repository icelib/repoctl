import type { ToolingCapability } from './types'

const capabilities: ToolingCapability[] = [{
  id: 'playwright',
  version: 1,
  description: 'Add an independent Chromium E2E workspace to an existing Vue/React Vite app.',
  requirements: ['A named Vue or React Vite workspace', 'build and preview scripts', 'An explicit route, click target and expected text'],
}]

/** Discovery is static: it never imports project configuration or installs a browser. */
export function listToolingCapabilities(): ToolingCapability[] {
  return structuredClone(capabilities)
}
