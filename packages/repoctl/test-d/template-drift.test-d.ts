import type { TemplateDriftReport } from 'repoctl'
import { checkTemplateDrift } from 'repoctl'
import { expectType } from 'tsd'

expectType<Promise<TemplateDriftReport>>(checkTemplateDrift('/workspace', { sourceDir: '/extracted' }))
