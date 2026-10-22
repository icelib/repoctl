export interface ReleaseCompletionRecord {
  schemaVersion: 1
  id: string
  repository: string
  branch: string
  distTag: string
  sourceSha: string
  packages: Array<{ name: string, version: string, sourceSha: string }>
  releasedPackages: string[]
  checkpointKey: string
}

export interface ReleaseCompletionResult {
  record: ReleaseCompletionRecord
  sites: string[]
}
