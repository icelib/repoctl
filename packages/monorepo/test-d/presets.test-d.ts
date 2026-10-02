import type { ConfigOrigin, ConfigValueSource, OrganizationPresetAssetPlan, OrganizationPresetManifest, OrganizationPresetResolution } from '@icebreakers/monorepo'
import { applyOrganizationPresetAssets, defineMonorepoConfig, planOrganizationPresetAssets, resolveCommandValues, resolveOrganizationPresets } from '@icebreakers/monorepo'
import { expectAssignable, expectError, expectType } from 'tsd'

expectAssignable<OrganizationPresetManifest>({ schemaVersion: 1, requires: { repoctl: '^5.6.0' }, templates: { team: { source: 'templates/team', target: 'packages' } }, capabilities: [{ id: 'playwright' }] })
expectType<Promise<OrganizationPresetResolution>>(resolveOrganizationPresets('/repo', [{ packageName: '@team/preset', version: '1.0.0' }]))
expectType<Promise<OrganizationPresetAssetPlan>>(planOrganizationPresetAssets('/repo'))
expectType<ConfigOrigin | undefined>(resolveCommandValues('clean').origins['dryRun'])
expectType<ConfigValueSource | undefined>(resolveCommandValues('clean').sources['dryRun'])
expectError(defineMonorepoConfig({ presets: [{ packageName: '@team/preset' }] }))
expectError(applyOrganizationPresetAssets({ schemaVersion: 2 }))
