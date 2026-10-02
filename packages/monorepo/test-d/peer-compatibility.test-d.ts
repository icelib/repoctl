import type { PeerCompatibilityReport } from '@icebreakers/monorepo'
import { checkPeerDependencies } from '@icebreakers/monorepo'
import { expectType } from 'tsd'

expectType<Promise<PeerCompatibilityReport>>(checkPeerDependencies('.'))
