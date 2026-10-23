/** Only repoctl-owned messages enter generated errors and reports; never copy exception text. */
const messages = {
  'plan-failed': 'Run repo docs plan with the same inputs to inspect configuration, source selection and release evidence before retrying.',
  'plan-blocked': 'Documentation source or release checks blocked this deployment; run repo docs plan with the same inputs to inspect the blockers.',
  'workflow-required': 'Stable documentation requires the managed GitHub workflow and its per-site concurrency group.',
  'deployment-unresolved': 'An unfinished deployment must be retried with the same release and corrections before advancing.',
  'readiness-policy-missing': 'An unfinished verification requires its frozen readiness policy; retry the original deployment.',
  'claim-changed': 'The deployment claim changed; another run owns this checkpoint. Refusing to advance stale work.',
  'main-advanced': 'Main advanced during preview deployment; deploy the latest main source instead.',
  'source-tree-changed': 'The source tree no longer matches the inspected deployment; repeat the plan before deploying.',
  'snapshot-mismatch': 'The frozen stable snapshot no longer matches the verified deployment; inspect the persisted checkpoint.',
  'checkpoint-invalid': 'The documentation checkpoint is invalid; inspect its identity, snapshot and provider receipt before retrying.',
  'checkpoint-read-failed': 'Cannot read the documentation checkpoint; verify state-store access before retrying.',
  'checkpoint-write-failed': 'The checkpoint write or revision comparison failed; reload state and retry the same deployment without replacing another run.',
  'receipt-invalid': 'The provider receipt requires a nonempty versionId and optional HTTP(S) URL without credentials, query or fragment.',
  'process-failed': 'The documentation process failed; inspect its streamed terminal output and retry after fixing the command.',
  'script-result-invalid': 'The deployment script must write valid { versionId, url? } JSON to REPO_DOCS_RESULT_FILE after provider verification.',
  'artifact-path-invalid': 'The documentation configuration and assets must stay inside the frozen checkout without external symlinks.',
  'artifact-output-missing': 'The documentation build must produce an existing assets output directory.',
  'manifest-conflict': 'The deployment manifest conflicts with existing output; remove the conflicting file from the build output.',
  'credentials-missing': 'CLOUDFLARE_API_TOKEN is required to verify documentation deployments.',
  'provider-environment-conflict': 'Cloudflare environment overrides conflict with the frozen account, Worker or API origin; remove the conflicting override.',
  'provider-access-denied': 'Cloudflare denied read access; verify the API token, account and Worker permissions.',
  'provider-rate-limited': 'Cloudflare rate-limited verification; retry the same deployment after the limit clears.',
  'provider-request-rejected': 'Cloudflare rejected verification; inspect the account and Worker configuration before retrying.',
  'provider-network-failed': 'Cloudflare read-only verification failed due to a network error, timeout or invalid JSON response.',
  'provider-response-invalid': 'Cloudflare returned an invalid verification response; do not upload until provider state can be verified.',
  'provider-traffic-ambiguous': 'The active Cloudflare deployment must serve exactly one valid version at 100% traffic.',
  'provider-version-mismatch': 'Cloudflare returned a different version than requested; retry only after the active version is verified.',
  'provider-version-inactive': 'The uploaded documentation version is not confirmed active; retry the same deployment.',
  'saved-version-inactive': 'The saved documentation version is no longer active; recovery cannot upload a replacement.',
  'provider-target-invalid': 'Cloudflare requires valid accountId, workerName and optional environment values.',
  'provider-config-invalid': 'The frozen Cloudflare configuration must be valid static JSON or JSONC.',
  'provider-config-unreadable': 'Cannot read the frozen Cloudflare configuration; verify the configured file exists inside the checkout.',
  'provider-identity-mismatch': 'Cloudflare configuration does not match the frozen accountId and workerName.',
  'provider-domain-mismatch': 'The Cloudflare documentation URL must match a configured HTTPS custom domain.',
  'provider-target-shared': 'Preview and stable cannot deploy to the same Cloudflare Worker.',
  'provider-domain-shared': 'Preview and stable Cloudflare Workers cannot own the same custom domain.',
  'provider-config-changed': 'Cloudflare configuration changed during the documentation build; keep deployment configuration immutable.',
  'unsupported-config': 'Unsupported static Cloudflare configuration; use the documentation script adapter for custom deployment features.',
  'generated-config': 'Generated Wrangler configuration is not supported by the native provider; use the documentation script adapter.',
  'environment-routes-missing': 'A named Cloudflare environment must explicitly declare routes when the top level owns routes.',
  'wrangler-missing': 'Declare Wrangler in this workspace and install it with the frozen lockfile before deployment.',
  'wrangler-invalid': 'Wrangler must resolve to a valid CLI inside the frozen checkout node_modules.',
  'wrangler-result-invalid': 'Wrangler must report exactly one valid deployed version matching the frozen Worker and environment.',
  'readiness-url-invalid': 'Documentation readiness requires an explicit HTTPS target URL without credentials, query or fragment.',
  'preview-selection-invalid': 'Preview only accepts a source SHA, not stable release records or corrections',
  'stable-selection-invalid': 'Stable documentation requires a completed release record, never an arbitrary source SHA',
  'stable-baseline-missing': 'No stable documentation baseline exists; wait for a complete stable release and provide its record ID',
  'release-identity-mismatch': 'Stable documentation requires this repository’s main/latest release completion',
  'preview-source-missing': 'Preview requires an explicit source SHA',
} as const

export type DocsDiagnosticReason = keyof typeof messages

export function docsDiagnosticMessage(reason: string) {
  return Object.hasOwn(messages, reason) ? messages[reason as DocsDiagnosticReason] : undefined
}

export class DocsDiagnosticError extends Error {
  constructor(readonly reason: DocsDiagnosticReason) {
    super(messages[reason])
    this.name = 'DocsDiagnosticError'
  }
}
