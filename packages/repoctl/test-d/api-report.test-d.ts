import type { PublicApiReport, PublicApiUpdatePlan, PublicApiUpdateResult } from 'repoctl'
import { applyPublicApiUpdate, checkPublicApi, planPublicApiUpdate } from 'repoctl'
import { expectType } from 'tsd'

expectType<Promise<PublicApiReport>>(checkPublicApi('.'))
expectType<Promise<PublicApiUpdatePlan>>(planPublicApiUpdate('.'))
declare const plan: PublicApiUpdatePlan
expectType<Promise<PublicApiUpdateResult>>(applyPublicApiUpdate('.', plan))
