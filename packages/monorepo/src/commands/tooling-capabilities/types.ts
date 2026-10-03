export interface ToolingCapability {
  id: 'playwright' | 'storybook'
  version: 1
  description: string
  requirements: string[]
}

export interface PlaywrightInteraction {
  route: string
  click: { testId: string } | { role: 'button' | 'link', name: string }
  expectText: string
}

export interface PlaywrightCapabilityOptions {
  capability: 'playwright'
  /** Exact workspace name or path relative to the workspace root. */
  target: string
  /** Defaults to e2e/<target slug>. */
  directory?: string
  interaction: PlaywrightInteraction
  port?: number
  ciPort?: number
  /** Explicit local opt-in; CI always starts its own service. */
  reuseExistingServer?: boolean
}

export type StorybookArgs = Record<string, string | number | boolean | null>

export interface StorybookCapabilityOptions {
  capability: 'storybook'
  target: string
  /** Defaults to stories/<target slug>; always separate from the library. */
  directory?: string
  framework: 'vue' | 'react'
  /** Named component export from the target library. */
  component: string
  example: {
    kind: 'prop-update'
    prop: string
    initial: string
    updated: string
  } | {
    kind: 'click'
    args: StorybookArgs
    alternateArgs: StorybookArgs
    click: PlaywrightInteraction['click']
    expectText: string
  }
}

export type ToolingCapabilityOptions = PlaywrightCapabilityOptions | StorybookCapabilityOptions

export interface ToolingCapabilityFile {
  path: string
  status: 'add' | 'modify' | 'identical' | 'conflict'
  beforeHash: string | null
  afterHash: string
  before: string | null
  after: string
  diff: string | null
}

export interface ToolingCapabilityPlan {
  schemaVersion: 1
  rootDir: string
  capability: ToolingCapability
  options: ToolingCapabilityOptions
  target: { name: string, directory: string, manifestHash: string }
  workspace: { name: string, directory: string }
  status: 'ready' | 'blocked' | 'unchanged'
  files: ToolingCapabilityFile[]
  dependencies: { package: string, name: string, version: string, kind: 'devDependencies' }[]
  scripts: { package: string, name: string, command: string }[]
  conflicts: { id: string, path: string, detail: string }[]
  nextSteps: string[]
}

export interface ToolingCapabilityResult {
  status: 'applied' | 'unchanged'
  changed: string[]
  nextSteps: string[]
}
