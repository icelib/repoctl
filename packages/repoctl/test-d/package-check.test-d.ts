import type { PackageCheckReport } from 'repoctl'
import { checkPackages } from 'repoctl'
import { expectType } from 'tsd'

expectType<Promise<PackageCheckReport>>(checkPackages({ cwd: '.', strict: true }))
