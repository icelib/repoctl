import type { MaintenanceUpgradeReport } from 'repoctl'
import { getMaintenanceWorkflow, prepareMaintenanceUpgrade } from 'repoctl'
import { expectType } from 'tsd'

expectType<Promise<string>>(getMaintenanceWorkflow())
expectType<Promise<string>>(getMaintenanceWorkflow('/workspace'))
expectType<Promise<MaintenanceUpgradeReport>>(prepareMaintenanceUpgrade({ cwd: '.', base: 'a'.repeat(40), outputDirectory: '../artifact' }))
