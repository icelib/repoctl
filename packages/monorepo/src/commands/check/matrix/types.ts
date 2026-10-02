import type { AffectedCheckCommand, AffectedCheckOptions, AffectedCheckPlan } from '../affected'

export interface AffectedCheckMatrixOptions extends AffectedCheckOptions {
  /** Maximum number of deterministic round-robin groups (1–256). Full fallback stays in one job. */
  shards?: number
}

export interface AffectedCheckMatrixJob {
  id: string
  /** Workspace-relative package directories assigned to this job. */
  packages: string[]
  /** Run these argument arrays in order from the checkout root, skipping entries with skipReason. */
  commands: AffectedCheckCommand[]
}

export interface AffectedCheckMatrix {
  schemaVersion: 1
  provider: 'github-actions'
  hasWork: boolean
  grouping: 'package' | 'shard' | 'full'
  summary: {
    selectedPackages: number
    jobs: number
    /** Selected packages whose group has no runnable stage. Reasons remain in affectedPlan. */
    skippedPackages: string[]
  }
  /** Pass only this object to GitHub Actions fromJSON, gated by hasWork. */
  matrix: { include: AffectedCheckMatrixJob[] }
  affectedPlan: AffectedCheckPlan
}
