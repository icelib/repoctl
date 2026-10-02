/** Reasoned waiver for one stable doctor rule ID. */
export interface DoctorSuppression {
  id: string
  reason: string
  /** UTC calendar date (YYYY-MM-DD), inclusive through the end of that day. */
  expires?: string
  /** Optional exact workspace-relative finding path, e.g. packages/app/package.json. */
  path?: string
}

export interface DoctorCommandConfig {
  /** Exact stable rule IDs. Omitted runs all; an empty array explicitly runs none. */
  rules?: string[]
  suppressions?: DoctorSuppression[]
}

export interface DoctorOptions extends DoctorCommandConfig {}
