import type { ToolingCapability } from './types'

const capabilities: ToolingCapability[] = [{
  id: 'playwright',
  version: 1,
  description: 'Add an independent Chromium E2E workspace to an existing Vue/React Vite app.',
  requirements: ['A named Vue or React Vite workspace', 'build and preview scripts', 'An explicit route, click target and expected text'],
}, {
  id: 'storybook',
  version: 1,
  description: 'Add optional stories and headless play tests for an existing Vue/React component library.',
  requirements: ['A named Vue 3 or React 18/19 component library with a build script', 'An explicit named component export and interaction example'],
}]

/** Discovery is static: it never imports project configuration or installs a browser. */
export function listToolingCapabilities(): ToolingCapability[] {
  return structuredClone(capabilities)
}
