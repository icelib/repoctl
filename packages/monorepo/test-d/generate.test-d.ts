import type { GeneratePlan, GenerateResult } from '@icebreakers/monorepo'
import { applyGeneratePlan, planGenerate } from '@icebreakers/monorepo'
import { expectError, expectType } from 'tsd'

const plan = planGenerate({ cwd: '.', package: '@org/ui', generator: 'react-component', parameters: { name: 'card', export: true } })
expectType<Promise<GeneratePlan>>(plan)
void plan.then(value => expectType<Promise<GenerateResult>>(applyGeneratePlan(value)))
expectError(planGenerate({ cwd: '.', package: '@org/ui', generator: 'unknown', parameters: {} }))
expectError(planGenerate({ cwd: '.', generator: 'hono-route', parameters: { name: 'health' } }))
