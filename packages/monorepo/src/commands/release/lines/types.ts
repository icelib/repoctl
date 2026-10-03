/** Git branches and npm channels; stable and maintenance use pnpm's native main lane. */
export interface ReleaseBranchesConfig {
  /** Primary stable branch. Defaults to main. */
  stable?: string
  maintenance?: Array<{ branch: string, range: string, tag: string }>
  /** Omitted keeps alpha/beta/rc/next; an empty array disables prerelease branches. */
  prerelease?: Array<{ branch: string, lane: string, tag: string, target?: string }>
}

export interface ReleaseBranchRule {
  branch: string
  kind: 'stable' | 'maintenance' | 'prerelease'
  lane: string
  range: string
  excludedRanges: string[]
  distTag: string
  /** Stable or maintenance branch reached when exiting this prerelease lane. */
  target: string
}
