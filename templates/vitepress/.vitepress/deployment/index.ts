import type { DocsContext } from 'repoctl/docs-context'
import type { DefaultTheme } from 'vitepress'
import { docsRobots, mergeDocsHeaders, resolveDocsContext } from 'repoctl/docs-context'

export const stableOrigin = 'https://repo.icebreaker.top'
export const previewOrigin = 'https://next.repo.icebreaker.top'

export type DocsDeployment = DocsContext

export interface DocsThemeConfig extends DefaultTheme.Config {
  docsPreview?: boolean
}

export function getDocsDeployment(channel: string | undefined, url?: string): DocsDeployment {
  return resolveDocsContext({ channel, url, previewOrigin, stableOrigin })
}

export function crawlerFiles(deployment: DocsDeployment) {
  return {
    robots: docsRobots(deployment),
    headers: mergeDocsHeaders('', deployment),
  }
}
