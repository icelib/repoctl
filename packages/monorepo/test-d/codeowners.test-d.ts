import type { CodeownersPlan, CodeownersReport } from '@icebreakers/monorepo'
import { applyCodeownersPlan, defineMonorepoConfig, inspectWorkspaceOwners, planCodeowners } from '@icebreakers/monorepo'
import { expectType } from 'tsd'

defineMonorepoConfig({ codeowners: { owners: { '@scope/app': ['@org/team'] } } })
expectType<Promise<CodeownersReport>>(inspectWorkspaceOwners({ cwd: '.' }))
expectType<Promise<CodeownersPlan>>(planCodeowners({ cwd: '.', file: '.github/CODEOWNERS' }))
expectType<Promise<{ status: 'applied' | 'unchanged', file: string }>>(applyCodeownersPlan({} as CodeownersPlan))
