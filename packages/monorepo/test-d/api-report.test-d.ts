import type { PublicApiConfig, PublicApiReport, PublicApiUpdatePlan, PublicApiUpdateResult } from '@icebreakers/monorepo'
import { applyPublicApiUpdate, checkPublicApi, defineMonorepoConfig, planPublicApiUpdate } from '@icebreakers/monorepo'
import { expectType } from 'tsd'

const configuration: PublicApiConfig = { sdk: { entries: { '.': { entryPoint: 'dist/index.d.ts', baseline: 'etc/sdk.api.md' } } } }
defineMonorepoConfig({ tooling: { apiReports: configuration } })
expectType<Promise<PublicApiReport>>(checkPublicApi('.'))
expectType<Promise<PublicApiUpdatePlan>>(planPublicApiUpdate('.', { packages: ['sdk'], timeoutMs: 1000 }))
declare const plan: PublicApiUpdatePlan
expectType<Promise<PublicApiUpdateResult>>(applyPublicApiUpdate('.', plan))
