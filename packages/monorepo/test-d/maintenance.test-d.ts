import type { MaintenanceUpgradeOptions, MaintenanceUpgradeReport, MaintenanceVersionChange } from '@icebreakers/monorepo'
import { detectMaintenanceVersionChange, getMaintenanceWorkflow, prepareMaintenanceUpgrade } from '@icebreakers/monorepo'
import { expectType } from 'tsd'

expectType<MaintenanceVersionChange>(detectMaintenanceVersionChange('', ''))
expectType<Promise<string>>(getMaintenanceWorkflow())
expectType<Promise<string>>(getMaintenanceWorkflow('/workspace'))
declare const options: MaintenanceUpgradeOptions
expectType<Promise<MaintenanceUpgradeReport>>(prepareMaintenanceUpgrade(options))

declare const report: MaintenanceUpgradeReport
expectType<'false' | 'true' | 'input' | undefined>(report.presets?.checkout?.autocrlf)
expectType<'native' | 'lf' | 'crlf' | undefined>(report.presets?.checkout?.eol)
expectType<Array<{ path: string, content: string }> | undefined>(report.presets?.checkout?.before)
