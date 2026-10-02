import type { ToolingCapabilityOptions } from '../types'
import { resolveStorybookSettings } from '../storybook/settings'
import { resolvePlaywrightSettings } from './playwright'

export async function resolveCapabilitySettings(cwd: string, input: ToolingCapabilityOptions) {
  if (input?.capability === 'storybook') {
    return { ...await resolveStorybookSettings(cwd, input), kind: 'storybook' as const }
  }
  return { ...await resolvePlaywrightSettings(cwd, input), kind: 'playwright' as const }
}

export type CapabilitySettings = Awaited<ReturnType<typeof resolveCapabilitySettings>>
export type PlaywrightSettings = Extract<CapabilitySettings, { kind: 'playwright' }>
export type StorybookSettings = Extract<CapabilitySettings, { kind: 'storybook' }>
