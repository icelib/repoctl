/**
 * Parsed repository metadata returned by GitClient.
 *
 * This public shape preserves the parser's fields without exposing its internal
 * declaration dependencies to consumers.
 */
export interface GitUrlMetadata {
  /** The Git hosting provider, such as github.com. */
  source: string
  owner: string
  name: string
  ref: string
  /** File path relative to the repository root. */
  filepath: string
  /** The path kind, such as blob or tree. */
  filepathtype: string
  full_name: string
  organization: string
  git_suffix?: boolean | undefined
  hash: string
  host: string
  href: string
  password: string
  parse_failed: boolean
  pathname: string
  port: string
  protocol: string
  protocols: string[]
  query: Record<string, string>
  resource: string
  search: string
  user: string
  /** OAuth token extracted from the URL, or an empty string. */
  token: string
  /** Format the repository URL using an optional protocol. */
  toString: (type?: string) => string
}
