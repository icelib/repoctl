import type { TemplateValidationReport } from 'repoctl'
import { validateTemplate } from 'repoctl'
import { expectType } from 'tsd'

expectType<Promise<TemplateValidationReport>>(validateTemplate({ template: 'internal', fixtureDir: './fixtures/workspace' }))
