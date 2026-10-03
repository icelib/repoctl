import type { MaintenanceUpgradeOptions, MaintenanceUpgradeReport, MaintenanceVersionChange } from '@icebreakers/monorepo'
import { detectMaintenanceVersionChange, getMaintenanceWorkflow, prepareMaintenanceUpgrade } from '@icebreakers/monorepo'
import { expectType } from 'tsd'

expectType<MaintenanceVersionChange>(detectMaintenanceVersionChange('', ''))
expectType<Promise<string>>(getMaintenanceWorkflow())
expectType<Promise<string>>(getMaintenanceWorkflow('/workspace'))
declare const options: MaintenanceUpgradeOptions
expectType<Promise<MaintenanceUpgradeReport>>(prepareMaintenanceUpgrade(options))
