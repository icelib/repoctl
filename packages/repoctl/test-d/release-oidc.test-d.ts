import type { ReleaseOidcAuditReport } from 'repoctl'
import { auditReleaseOidc } from 'repoctl'
import { expectType } from 'tsd'

expectType<Promise<ReleaseOidcAuditReport>>(auditReleaseOidc({ cwd: '.' }))
