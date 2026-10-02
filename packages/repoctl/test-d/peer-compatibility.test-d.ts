import type { PeerCompatibilityReport } from 'repoctl'
import { checkPeerDependencies } from 'repoctl'
import { expectType } from 'tsd'

expectType<Promise<PeerCompatibilityReport>>(checkPeerDependencies('.'))
